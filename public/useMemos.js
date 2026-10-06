// State and Firestore wiring for the memo pad (메모장), kept separate from
// rendering like useWeeklyTasks.js. Takes the signed-in user from
// useWeeklyTasks() rather than watching auth itself. Plain JS, no JSX.
function useMemos(authUser) {
  const [memos, setMemos] = useState([]);
  const [memosLoading, setMemosLoading] = useState(true);
  const [memosConnectionOk, setMemosConnectionOk] = useState(true);

  // subscribe to this account's memos, live
  useEffect(() => {
    if (!authUser) {
      setMemos([]);
      return;
    }
    setMemosLoading(true);
    const unsub = WeeklyPlannerAPI.watchMemos(
      authUser.uid,
      (next) => {
        setMemos(next);
        setMemosConnectionOk(true);
        setMemosLoading(false);
      },
      (err) => {
        console.error(err);
        setMemosConnectionOk(false);
        setMemosLoading(false);
      }
    );
    return unsub;
  }, [authUser]);

  const onWriteError = (e) => {
    console.error(e);
    setMemosConnectionOk(false);
  };

  const addMemo = (text) => {
    if (!authUser || !text.trim()) return;
    WeeklyPlannerAPI.createMemo(authUser.uid, text).catch(onWriteError);
  };
  const editMemo = (id, text) => {
    if (!authUser || !text.trim()) return;
    WeeklyPlannerAPI.updateMemo(authUser.uid, id, text).catch(onWriteError);
  };
  // returns whether the user confirmed, so the editor knows to close
  const removeMemo = (id) => {
    if (!authUser || !window.confirm("이 메모를 삭제할까요?")) return false;
    WeeklyPlannerAPI.deleteMemo(authUser.uid, id).catch(onWriteError);
    return true;
  };

  return { memos, memosLoading, memosConnectionOk, addMemo, editMemo, removeMemo };
}
