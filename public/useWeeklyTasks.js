// All state, Firestore wiring, and carry-over decision logic for the weekly
// planner, kept separate from rendering. WeeklyPlanner.jsx only consumes what
// this hook returns.
const { useState, useEffect, useCallback, useMemo, useRef } = React;

function useWeeklyTasks() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [connectionOk, setConnectionOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [authUid, setAuthUid] = useState(null);

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

  // sign in anonymously once
  useEffect(() => {
    const unsub = WeeklyPlannerAPI.watchAuth(
      (uid) => setAuthUid(uid),
      (e) => {
        setConnectionOk(false);
        showFallback(
          "로그인에 실패했어요: " + e.message +
          "\nFirebase 콘솔에서 Authentication > 로그인 방법 > 익명 을 사용 설정했는지 확인해주세요."
        );
      }
    );
    return unsub;
  }, []);

  // subscribe to this week's document, live
  useEffect(() => {
    if (!authUid) return;
    setLoading(true);
    setSelectedDay(todayIndexInWeek >= 0 ? todayIndexInWeek : 0);
    const unsub = WeeklyPlannerAPI.watchWeek(
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
  }, [weekKey, authUid]);

  const persist = useCallback((next) => {
    setTasks(next); // optimistic UI update; onSnapshot will confirm
    WeeklyPlannerAPI.writeWeek(weekKey, next).catch((e) => {
      console.error(e);
      setConnectionOk(false);
    });
  }, [weekKey]);

  // carry over incomplete tasks from earlier days in this week to today, as
  // independent copies — the original stays on its own day (marked so it
  // isn't copied again), the copy lands on today and is a separate task
  const makeCarriedCopy = (t, dayIdx, sourceMonday) => ({
    id: uid(),
    day: dayIdx,
    text: t.text,
    done: false,
    important: t.important,
    createdAt: Date.now(),
    carriedOver: true,
    originDate: t.originDate || formatMD(addDays(sourceMonday, t.day)),
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
    if (!authUid) return;
    if (prevWeekCarryRanForRef.current === weekKey) return;
    prevWeekCarryRanForRef.current = weekKey;

    const prevMonday = addDays(monday, -7);
    const prevKey = toKey(prevMonday);

    WeeklyPlannerAPI.runCarryOverFromPrevWeek(weekKey, prevKey, (currentTasks, prevTasks) => {
      const toForward = prevTasks.filter((t) => !t.done && !t.forwarded);
      if (toForward.length === 0) return null;

      const forwardIds = new Set(toForward.map((t) => t.id));
      const markedPrev = prevTasks.map((t) => (forwardIds.has(t.id) ? { ...t, forwarded: true } : t));
      const copies = toForward.map((t) => makeCarriedCopy(t, todayIndexInWeek, prevMonday));
      return { nextCurrent: [...currentTasks, ...copies], markedPrev };
    }).catch((e) => console.error("carry-over (prev week) failed", e));
  }, [weekOffset, loading, todayIndexInWeek, authUid, weekKey, monday]);

  const addTask = (text, dayIdx) => {
    const trimmed = text.trim();
    if (!trimmed || dayIdx === null) return;
    const next = [...tasks, { id: uid(), day: dayIdx, text: trimmed, done: false, important: false, createdAt: Date.now() }];
    persist(next);
  };
  const toggleDone = (id) => persist(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const toggleImportant = (id) => persist(tasks.map((t) => (t.id === id ? { ...t, important: !t.important } : t)));
  const removeTask = (id) => persist(tasks.filter((t) => t.id !== id));
  const clearDay = (dayIdx) => {
    if (tasks.filter((t) => t.day === dayIdx).length === 0) return;
    if (window.confirm("이 요일의 할 일을 모두 지울까요? (모두에게 함께 삭제됩니다)")) {
      persist(tasks.filter((t) => t.day !== dayIdx));
    }
  };

  const tasksFor = (dayIdx) =>
    tasks.filter((t) => t.day === dayIdx).sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.important !== b.important) return a.important ? -1 : 1;
      return a.createdAt - b.createdAt;
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
    weekOffset, setWeekOffset,
    connectionOk, loading,
    selectedDay, setSelectedDay,
    today, weekDates,
    addTask, toggleDone, toggleImportant, removeTask, clearDay,
    tasksFor, progressFor, weekProgress,
  };
}
