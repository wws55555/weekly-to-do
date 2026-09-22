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

  const signOut = useCallback(() => {
    prevWeekCarryRanForRef.current = null;
    return WeeklyPlannerAPI.signOutUser();
  }, []);

  // subscribe to this week's document, live
  useEffect(() => {
    if (!authUser) return;
    setLoading(true);
    setSelectedDay(todayIndexInWeek >= 0 ? todayIndexInWeek : 0);
    const unsub = WeeklyPlannerAPI.watchWeek(
      authUser.uid,
      weekKey,
      (nextTasks) => {
        setTasks(nextTasks);
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

  const persist = useCallback((next) => {
    setTasks(next); // optimistic UI update; onSnapshot will confirm
    if (!authUser) return;
    WeeklyPlannerAPI.writeWeek(authUser.uid, weekKey, next).catch((e) => {
      console.error(e);
      setConnectionOk(false);
    });
  }, [weekKey, authUser]);

  // carry over incomplete tasks from earlier days in this week to today, as
  // independent copies — the original stays on its own day (marked so it
  // isn't copied again), the copy lands on today and is a separate task
  const makeCarriedCopy = (t, dayIdx, sourceMonday) => ({
    id: uid(),
    day: dayIdx,
    text: t.text,
    done: false,
    createdAt: Date.now(),
    carriedOver: true,
    originDate: t.originDate || formatMD(addDays(sourceMonday, t.day)),
    checklist: (t.checklist || []).map((c) => ({ ...c })),
  });

  useEffect(() => {
    if (weekOffset !== 0 || loading || todayIndexInWeek < 0) return;
    const toForward = tasks.filter((t) => !t.done && !t.forwarded && t.day < todayIndexInWeek);
    if (toForward.length === 0) return;
    const forwardIds = new Set(toForward.map((t) => t.id));
    const marked = tasks.map((t) => (forwardIds.has(t.id) ? { ...t, forwarded: true } : t));
    const copies = toForward.map((t) => makeCarriedCopy(t, todayIndexInWeek, monday));
    persist([...marked, ...copies]);
  }, [tasks, todayIndexInWeek, weekOffset, loading, persist, monday]);

  // carry over incomplete tasks left in last week's document, once per week view
  useEffect(() => {
    if (weekOffset !== 0 || loading || todayIndexInWeek < 0) return;
    if (!authUser) return;
    if (prevWeekCarryRanForRef.current === weekKey) return;
    prevWeekCarryRanForRef.current = weekKey;

    const prevMonday = addDays(monday, -7);
    const prevKey = toKey(prevMonday);

    WeeklyPlannerAPI.runCarryOverFromPrevWeek(authUser.uid, weekKey, prevKey, (currentTasks, prevTasks) => {
      const toForward = prevTasks.filter((t) => !t.done && !t.forwarded);
      if (toForward.length === 0) return null;

      const forwardIds = new Set(toForward.map((t) => t.id));
      const markedPrev = prevTasks.map((t) => (forwardIds.has(t.id) ? { ...t, forwarded: true } : t));
      const copies = toForward.map((t) => makeCarriedCopy(t, todayIndexInWeek, prevMonday));
      return { nextCurrent: [...currentTasks, ...copies], markedPrev };
    }).catch((e) => console.error("carry-over (prev week) failed", e));
  }, [weekOffset, loading, todayIndexInWeek, authUser, weekKey, monday]);

  const addTask = (text, dayIdx) => {
    const trimmed = text.trim();
    if (!trimmed || dayIdx === null) return;
    const next = [...tasks, { id: uid(), day: dayIdx, text: trimmed, done: false, createdAt: Date.now() }];
    persist(next);
  };
  // editTask optionally also moves the task to a new date: targetDate is a
  // local-midnight Date, or omitted/null to just change the text in place.
  // Landing on a day within the currently-open week is a plain client-side
  // day change; landing in a different week crosses Firestore documents, so
  // that case goes through a transaction (moveTaskAcrossWeeks) instead of
  // persist() — the task optimistically disappears from the current view
  // right away, and the target week's own subscription picks it up when it's
  // next viewed.
  const editTask = (id, text, targetDate) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!targetDate) {
      persist(tasks.map((t) => (t.id === id ? { ...t, text: trimmed } : t)));
      return;
    }

    const targetMonday = getMonday(targetDate);
    const targetWeekKey = toKey(targetMonday);
    const targetDay = Math.round((targetDate - targetMonday) / 86400000);

    if (targetWeekKey === weekKey) {
      persist(tasks.map((t) => (t.id === id ? { ...t, text: trimmed, day: targetDay } : t)));
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
  const toggleDone = (id) => persist(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const removeTask = (id) => {
    const target = tasks.find((t) => t.id === id);
    const label = target ? withEul(target.text) : "이 할 일을";
    if (window.confirm(`${label} 삭제할까요?`)) {
      persist(tasks.filter((t) => t.id !== id));
    }
  };
  const clearDay = (dayIdx) => {
    if (tasks.filter((t) => t.day === dayIdx).length === 0) return;
    if (window.confirm("이 요일의 할 일을 모두 지울까요?")) {
      persist(tasks.filter((t) => t.day !== dayIdx));
    }
  };
  // persists a manual order for one day's tasks — orderedIds is the full,
  // final id sequence for that day after a drag; done-status grouping still
  // wins in tasksFor's sort, so a done task dragged above an undone one will
  // snap back down on the next render (by design, not a bug)
  const reorderDay = (dayIdx, orderedIds) => {
    const orderIndex = new Map(orderedIds.map((id, i) => [id, i]));
    persist(tasks.map((t) => (t.day === dayIdx && orderIndex.has(t.id) ? { ...t, order: orderIndex.get(t.id) } : t)));
  };

  // per-task detail checklist — each task's own `checklist: [{id, text, done}]`
  const addChecklistItem = (taskId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    persist(tasks.map((t) =>
      t.id === taskId
        ? { ...t, checklist: [...(t.checklist || []), { id: uid(), text: trimmed, done: false }] }
        : t
    ));
  };
  const toggleChecklistItem = (taskId, itemId) => {
    persist(tasks.map((t) =>
      t.id === taskId
        ? { ...t, checklist: (t.checklist || []).map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)) }
        : t
    ));
  };
  const removeChecklistItem = (taskId, itemId) => {
    persist(tasks.map((t) =>
      t.id === taskId
        ? { ...t, checklist: (t.checklist || []).filter((c) => c.id !== itemId) }
        : t
    ));
  };
  const editChecklistItem = (taskId, itemId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    persist(tasks.map((t) =>
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
    authUser, authChecked, authError, authPending, signUp, signIn, signOut,
    weekOffset, setWeekOffset,
    connectionOk, loading,
    selectedDay, setSelectedDay,
    today, weekDates,
    addTask, editTask, toggleDone, removeTask, clearDay, reorderDay,
    addChecklistItem, toggleChecklistItem, removeChecklistItem, editChecklistItem,
    tasksFor, progressFor, weekProgress,
  };
}
