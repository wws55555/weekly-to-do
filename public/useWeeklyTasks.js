// All state, Firestore wiring, and carry-over decision logic for the weekly
// planner, kept separate from rendering. WeeklyPlanner.jsx only consumes what
// this hook returns.
const { useState, useEffect, useCallback, useMemo, useRef } = React;

function authErrorMessage(e) {
  switch (e && e.code) {
    case "auth/email-already-in-use": return "이미 가입된 이메일이에요.";
    case "auth/invalid-email": return "이메일 형식이 올바르지 않아요.";
    case "auth/weak-password": return "비밀번호는 6자 이상이어야 해요.";
    case "auth/user-not-found": return "가입되지 않은 이메일이에요.";
    case "auth/wrong-password": return "비밀번호가 틀렸어요.";
    case "auth/invalid-credential": return "이메일 또는 비밀번호가 올바르지 않아요.";
    case "auth/too-many-requests": return "너무 여러 번 시도했어요. 잠시 후 다시 시도해주세요.";
    case "auth/operation-not-allowed": return "이메일/비밀번호 로그인이 아직 켜져있지 않아요. Firebase 콘솔에서 설정해주세요.";
    default: return (e && e.message) || "알 수 없는 오류가 발생했어요.";
  }
}

// appends the Korean object particle (을/를) based on whether the word's
// last syllable has a batchim (final consonant)
function withEul(word) {
  if (!word) return word;
  const code = word.charCodeAt(word.length - 1);
  const hasBatchim = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 !== 0 : true;
  return word + (hasBatchim ? "을" : "를");
}

function useWeeklyTasks() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [tasks, setTasks] = useState([]);
  // which `${uid}/${weekKey}` the `tasks` array was last loaded from — see
  // tasksReady below
  const [tasksSource, setTasksSource] = useState(null);
  const [connectionOk, setConnectionOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authPending, setAuthPending] = useState(false);

  const [today, setToday] = useState(() => new Date());
  const monday = useMemo(() => addDays(getMonday(today), weekOffset * 7), [today, weekOffset]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const weekKey = useMemo(() => toKey(monday), [monday]);
  const todayIndexInWeek = useMemo(() => weekDates.findIndex((d) => isSameDay(d, today)), [weekDates, today]);
  const prevWeekCarryRanForRef = useRef(null);
  // `tasks` only belongs to the doc being viewed once that doc's snapshot has
  // arrived. Right after a week (or account) switch, weekKey/authUser already
  // point at the new doc while `tasks` still holds the previous one's array —
  // and since every write overwrites the whole array, persisting (or running
  // carry-over) in that window would clobber the new doc with the old doc's
  // tasks. Every write path checks this first.
  const tasksReady = authUser !== null && tasksSource === `${authUser.uid}/${weekKey}`;
  // set by goToDate() right before a weekOffset change that crosses into a
  // different week, so the weekKey-change effect below lands on that exact
  // day instead of its usual "jump to today" default
  const pendingSelectedDayRef = useRef(null);

  // keep "today" current if the app is left open across midnight
  useEffect(() => {
    const checkDay = () => {
      setToday((prev) => {
        const now = new Date();
        return isSameDay(now, prev) ? prev : now;
      });
    };
    const interval = setInterval(checkDay, 60000);
    document.addEventListener("visibilitychange", checkDay);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", checkDay);
    };
  }, []);

  // just observe auth state — no automatic sign-in of any kind
  useEffect(() => {
    const unsub = WeeklyPlannerAPI.watchAuthState((user) => {
      setAuthUser(user);
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  const signUp = useCallback((email, password) => {
    setAuthError(null);
    setAuthPending(true);
    return WeeklyPlannerAPI.signUp(email, password)
      .catch((e) => { setAuthError(authErrorMessage(e)); throw e; })
      .finally(() => setAuthPending(false));
  }, []);

  const signIn = useCallback((email, password) => {
    setAuthError(null);
    setAuthPending(true);
    return WeeklyPlannerAPI.signIn(email, password)
      .catch((e) => { setAuthError(authErrorMessage(e)); throw e; })
      .finally(() => setAuthPending(false));
  }, []);

  // rejects with an Error whose message is already user-facing Korean text,
  // so the change-password form can show it as-is
  const changePassword = useCallback((currentPassword, newPassword) => {
    return WeeklyPlannerAPI.changePassword(currentPassword, newPassword).catch((e) => {
      const code = e && e.code;
      const message = code === "auth/wrong-password" || code === "auth/invalid-credential"
        ? "현재 비밀번호가 틀렸어요."
        : authErrorMessage(e);
      throw new Error(message);
    });
  }, []);

  const signOut = useCallback(() => {
    prevWeekCarryRanForRef.current = null;
    return WeeklyPlannerAPI.signOutUser();
  }, []);

  // subscribe to this week's document, live
  useEffect(() => {
    if (!authUser) return;
    setLoading(true);
    if (pendingSelectedDayRef.current !== null) {
      setSelectedDay(pendingSelectedDayRef.current);
      pendingSelectedDayRef.current = null;
    } else {
      setSelectedDay(todayIndexInWeek >= 0 ? todayIndexInWeek : 0);
    }
    const unsub = WeeklyPlannerAPI.watchWeek(
      authUser.uid,
      weekKey,
      (nextTasks) => {
        setTasks(nextTasks);
        setTasksSource(`${authUser.uid}/${weekKey}`);
        setConnectionOk(true);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setConnectionOk(false);
        setLoading(false);
      }
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey, authUser]);

  // every write to the current week goes through here: fn maps a tasks array
  // to the next one (or null for "nothing to do"). It's applied to local
  // state right away (optimistic UI; onSnapshot confirms), and separately to
  // the server's latest array inside a transaction — so it must be pure and
  // must express the change relative to its argument, never close over
  // `tasks` itself.
  const mutate = useCallback((fn) => {
    if (!tasksReady) return; // local `tasks` belongs to another doc
    setTasks((prev) => fn(prev) || prev);
    WeeklyPlannerAPI.updateWeek(authUser.uid, weekKey, fn).catch((e) => {
      console.error(e);
      setConnectionOk(false);
    });
  }, [weekKey, authUser, tasksReady]);

  // carry over incomplete tasks from earlier days in this week to today, as
  // independent copies — the original stays on its own day (marked so it
  // isn't copied again), the copy lands on today and is a separate task
  const makeCarriedCopy = (t, dayIdx, sourceMonday, seedCreatedAt) => ({
    id: uid(),
    day: dayIdx,
    text: t.text,
    done: false,
    createdAt: seedCreatedAt,
    carriedOver: true,
    originDate: t.originDate || formatMD(addDays(sourceMonday, t.day)),
    checklist: (t.checklist || []).map((c) => ({ ...c })),
  });

  // tasksFor's own sort (done sinks, then order ?? createdAt) restricted to
  // not-done, unforwarded tasks and extended to break day ties first — used
  // to preserve each source day's manual/registration order when several
  // days' worth of tasks carry over together
  const sortForCarryOver = (list) =>
    [...list].sort((a, b) => (a.day - b.day) || ((a.order ?? a.createdAt) - (b.order ?? b.createdAt)));

  useEffect(() => {
    if (weekOffset !== 0 || loading || !tasksReady || todayIndexInWeek < 0) return;
    const now = Date.now();
    // re-evaluated against the server's copy inside the transaction too, so
    // two devices opening the app at once can't both forward the same task
    const carry = (list) => {
      const toForward = sortForCarryOver(list.filter((t) => !t.done && !t.forwarded && t.day < todayIndexInWeek));
      if (toForward.length === 0) return null;
      const forwardIds = new Set(toForward.map((t) => t.id));
      const marked = list.map((t) => (forwardIds.has(t.id) ? { ...t, forwarded: true } : t));
      const copies = toForward.map((t, i) => makeCarriedCopy(t, todayIndexInWeek, monday, now + i));
      return [...marked, ...copies];
    };
    if (carry(tasks) === null) return;
    mutate(carry);
  }, [tasks, tasksReady, todayIndexInWeek, weekOffset, loading, mutate, monday]);

  // carry over incomplete tasks left in last week's document, once per week view
  useEffect(() => {
    if (weekOffset !== 0 || loading || todayIndexInWeek < 0) return;
    if (!authUser) return;
    if (prevWeekCarryRanForRef.current === weekKey) return;
    prevWeekCarryRanForRef.current = weekKey;

    const prevMonday = addDays(monday, -7);
    const prevKey = toKey(prevMonday);

    WeeklyPlannerAPI.runCarryOverFromPrevWeek(authUser.uid, weekKey, prevKey, (currentTasks, prevTasks) => {
      const toForward = sortForCarryOver(prevTasks.filter((t) => !t.done && !t.forwarded));
      if (toForward.length === 0) return null;

      const forwardIds = new Set(toForward.map((t) => t.id));
      const markedPrev = prevTasks.map((t) => (forwardIds.has(t.id) ? { ...t, forwarded: true } : t));
      const now = Date.now();
      const copies = toForward.map((t, i) => makeCarriedCopy(t, todayIndexInWeek, prevMonday, now + i));
      return { nextCurrent: [...currentTasks, ...copies], markedPrev };
    }).catch((e) => console.error("carry-over (prev week) failed", e));
  }, [weekOffset, loading, todayIndexInWeek, authUser, weekKey, monday]);

  // for the calendar picker's per-date markers: resolves to
  // { "YYYY-MM-DD": "open" | "done" } for every date in [fromDate, toDate]'s
  // weeks that has any task — "open" if at least one is still undone and not
  // already forwarded to a later day, "done" otherwise. The currently-viewed
  // week uses the live `tasks` rather than the one-shot read.
  const fetchCalendarMarks = useCallback((fromDate, toDate) => {
    if (!authUser) return Promise.resolve({});
    const fromKey = toKey(getMonday(fromDate));
    const lastKey = toKey(getMonday(toDate));
    return WeeklyPlannerAPI.fetchWeeksInRange(authUser.uid, fromKey, lastKey).then((weeks) => {
      if (tasksReady) weeks[weekKey] = tasks;
      const marks = {};
      Object.entries(weeks).forEach(([key, list]) => {
        const [y, m, d] = key.split("-").map(Number);
        const weekMonday = new Date(y, m - 1, d);
        list.forEach((t) => {
          const dateKey = toKey(addDays(weekMonday, t.day));
          const open = !t.done && !t.forwarded;
          marks[dateKey] = marks[dateKey] === "open" || open ? "open" : "done";
        });
      });
      return marks;
    });
  }, [authUser, tasksReady, weekKey, tasks]);

  // jump straight to an arbitrary date (used by the calendar picker) —
  // within the currently-shown week that's just a selectedDay change;
  // a different week needs weekOffset to change first, so the target day is
  // stashed in pendingSelectedDayRef for the weekKey-change effect to apply
  const goToDate = useCallback((rawDate) => {
    // normalize to local midnight first — a raw `date` with a time-of-day
    // component (e.g. goToDate(today), where `today` is `new Date()`) would
    // otherwise make the day-index math below fractional and round to the
    // wrong day once past noon
    const date = new Date(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate());
    const targetMonday = getMonday(date);
    const targetOffset = Math.round((targetMonday - getMonday(today)) / (7 * 86400000));
    const dayIdx = Math.round((date - targetMonday) / 86400000);
    if (targetOffset === weekOffset) {
      setSelectedDay(dayIdx);
    } else {
      pendingSelectedDayRef.current = dayIdx;
      setWeekOffset(targetOffset);
    }
  }, [today, weekOffset]);

  const addTask = (text, dayIdx) => {
    const trimmed = text.trim();
    if (!trimmed || dayIdx === null) return;
    const task = { id: uid(), day: dayIdx, text: trimmed, done: false, createdAt: Date.now() };
    mutate((list) => [...list, task]);
  };
  // editTask optionally also moves the task to a new date: targetDate is a
  // local-midnight Date, or omitted/null to just change the text in place.
  // Landing on a day within the currently-open week is a plain client-side
  // day change; landing in a different week crosses Firestore documents, so
  // that case goes through a transaction (moveTaskAcrossWeeks) instead of
  // mutate() — the task optimistically disappears from the current view
  // right away, and the target week's own subscription picks it up when it's
  // next viewed.
  const editTask = (id, text, targetDate) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!targetDate) {
      mutate((list) => list.map((t) => (t.id === id ? { ...t, text: trimmed } : t)));
      return;
    }

    const targetMonday = getMonday(targetDate);
    const targetWeekKey = toKey(targetMonday);
    const targetDay = Math.round((targetDate - targetMonday) / 86400000);

    if (targetWeekKey === weekKey) {
      mutate((list) => list.map((t) => (t.id === id ? { ...t, text: trimmed, day: targetDay } : t)));
      return;
    }

    setTasks((prev) => prev.filter((t) => t.id !== id));
    WeeklyPlannerAPI.moveTaskAcrossWeeks(authUser.uid, weekKey, targetWeekKey, (sourceTasks, targetTasks) => {
      const idx = sourceTasks.findIndex((t) => t.id === id);
      if (idx === -1) return null;
      const movedTask = { ...sourceTasks[idx], text: trimmed, day: targetDay };
      return {
        nextSource: sourceTasks.filter((t) => t.id !== id),
        nextTarget: [...targetTasks, movedTask],
      };
    }).catch((e) => {
      console.error(e);
      setConnectionOk(false);
    });
  };
  // the new value is decided from what the user saw, not re-toggled against
  // the server copy — otherwise a concurrent toggle elsewhere would flip back
  const toggleDone = (id) => {
    const target = tasks.find((t) => t.id === id);
    if (!target) return;
    const done = !target.done;
    mutate((list) => list.map((t) => (t.id === id ? { ...t, done } : t)));
  };
  const removeTask = (id) => {
    const target = tasks.find((t) => t.id === id);
    const label = target ? withEul(target.text) : "이 할 일을";
    if (window.confirm(`${label} 삭제할까요?`)) {
      mutate((list) => list.filter((t) => t.id !== id));
    }
  };
  const clearDay = (dayIdx) => {
    if (tasks.filter((t) => t.day === dayIdx).length === 0) return;
    if (window.confirm("이 요일의 할 일을 모두 지울까요?")) {
      mutate((list) => list.filter((t) => t.day !== dayIdx));
    }
  };
  // persists a manual order for one day's tasks — orderedIds is the full,
  // final id sequence for that day after a drag; done-status grouping still
  // wins in tasksFor's sort, so a done task dragged above an undone one will
  // snap back down on the next render (by design, not a bug)
  const reorderDay = (dayIdx, orderedIds) => {
    const orderIndex = new Map(orderedIds.map((id, i) => [id, i]));
    mutate((list) => list.map((t) => (t.day === dayIdx && orderIndex.has(t.id) ? { ...t, order: orderIndex.get(t.id) } : t)));
  };

  // per-task detail checklist — each task's own `checklist: [{id, text, done}]`
  const addChecklistItem = (taskId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const item = { id: uid(), text: trimmed, done: false };
    mutate((list) => list.map((t) =>
      t.id === taskId
        ? { ...t, checklist: [...(t.checklist || []), item] }
        : t
    ));
  };
  const toggleChecklistItem = (taskId, itemId) => {
    const task = tasks.find((t) => t.id === taskId);
    const item = task && (task.checklist || []).find((c) => c.id === itemId);
    if (!item) return;
    const done = !item.done;
    mutate((list) => list.map((t) =>
      t.id === taskId
        ? { ...t, checklist: (t.checklist || []).map((c) => (c.id === itemId ? { ...c, done } : c)) }
        : t
    ));
  };
  const removeChecklistItem = (taskId, itemId) => {
    mutate((list) => list.map((t) =>
      t.id === taskId
        ? { ...t, checklist: (t.checklist || []).filter((c) => c.id !== itemId) }
        : t
    ));
  };
  const editChecklistItem = (taskId, itemId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    mutate((list) => list.map((t) =>
      t.id === taskId
        ? { ...t, checklist: (t.checklist || []).map((c) => (c.id === itemId ? { ...c, text: trimmed } : c)) }
        : t
    ));
  };

  const tasksFor = (dayIdx) =>
    tasks.filter((t) => t.day === dayIdx).sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const ao = a.order ?? a.createdAt;
      const bo = b.order ?? b.createdAt;
      return ao - bo;
    });
  const progressFor = (dayIdx) => {
    const list = tasks.filter((t) => t.day === dayIdx);
    const done = list.filter((t) => t.done).length;
    return { done, total: list.length };
  };
  const weekProgress = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.done).length;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [tasks]);

  return {
    authUser, authChecked, authError, authPending, signUp, signIn, signOut, changePassword,
    fetchCalendarMarks,
    weekOffset, setWeekOffset,
    connectionOk, loading,
    selectedDay, setSelectedDay, goToDate,
    today, weekDates,
    addTask, editTask, toggleDone, removeTask, clearDay, reorderDay,
    addChecklistItem, toggleChecklistItem, removeChecklistItem, editChecklistItem,
    tasksFor, progressFor, weekProgress,
  };
}
