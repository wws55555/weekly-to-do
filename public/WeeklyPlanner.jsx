// Pure UI: renders whatever useWeeklyTasks() gives it. No Firestore calls,
// no carry-over logic live here — see useWeeklyTasks.js / firestoreApi.js.
function WeeklyPlanner() {
  const [inputText, setInputText] = React.useState("");
  const [editingId, setEditingId] = React.useState(null);
  const [editingText, setEditingText] = React.useState("");
  const [reorderMode, setReorderMode] = React.useState(false);
  const [reorderIds, setReorderIds] = React.useState([]);
  const [draggingId, setDraggingId] = React.useState(null);
  const [checklistOpenId, setChecklistOpenId] = React.useState(null);
  const [checklistInput, setChecklistInput] = React.useState("");
  const [editingChecklistItemId, setEditingChecklistItemId] = React.useState(null);
  const [editingChecklistText, setEditingChecklistText] = React.useState("");
  const rowRefs = React.useRef({});
  const dragPointerId = React.useRef(null);
  const suppressPopRef = React.useRef(false);
  const {
    authUser, authChecked, authError, authPending, signUp, signIn, signOut,
    weekOffset, setWeekOffset,
    connectionOk, loading,
    selectedDay, setSelectedDay,
    today, weekDates,
    addTask, editTask, toggleDone, removeTask, clearDay, reorderDay,
    addChecklistItem, toggleChecklistItem, removeChecklistItem, editChecklistItem,
    tasksFor, progressFor,
  } = useWeeklyTasks();

  // leaving the day (or the whole day's list) mid-reorder would leave stale
  // drag/checklist state around, so just drop out of reorder mode
  React.useEffect(() => {
    setReorderMode(false);
    setDraggingId(null);
    setChecklistOpenId(null);
    setEditingChecklistItemId(null);
  }, [selectedDay]);

  // while the checklist modal is open, push a history entry so the phone's
  // hardware back button closes just the modal (popstate) instead of the
  // WebView having no history to go back to and exiting the whole app;
  // closing the modal any other way (X, backdrop) pops that entry back off
  React.useEffect(() => {
    if (!checklistOpenId) return;
    window.history.pushState({ wkModal: true }, "");
    const onPopState = () => {
      suppressPopRef.current = true;
      setChecklistOpenId(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!suppressPopRef.current) window.history.back();
      suppressPopRef.current = false;
    };
  }, [checklistOpenId]);

  const handleAddTask = () => {
    addTask(inputText, selectedDay);
    setInputText("");
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditingText(t.text);
  };
  const commitEdit = () => {
    if (editingId) editTask(editingId, editingText);
    setEditingId(null);
  };
  const cancelEdit = () => setEditingId(null);

  const toggleChecklistOpen = (id) => {
    setChecklistOpenId((prev) => (prev === id ? null : id));
    setChecklistInput("");
    setEditingChecklistItemId(null);
  };
  const closeChecklistModal = () => {
    setChecklistOpenId(null);
    setEditingChecklistItemId(null);
  };
  const handleAddChecklistItem = (taskId) => {
    addChecklistItem(taskId, checklistInput);
    setChecklistInput("");
  };
  const startEditChecklistItem = (item) => {
    setEditingChecklistItemId(item.id);
    setEditingChecklistText(item.text);
  };
  const commitEditChecklistItem = (taskId) => {
    if (editingChecklistItemId) editChecklistItem(taskId, editingChecklistItemId, editingChecklistText);
    setEditingChecklistItemId(null);
  };
  const cancelEditChecklistItem = () => setEditingChecklistItemId(null);

  const enterReorderMode = (list) => {
    setChecklistOpenId(null);
    setReorderIds(list.map((t) => t.id));
    setReorderMode(true);
  };
  const exitReorderMode = () => {
    setReorderMode(false);
    setDraggingId(null);
  };
  const handleGripPointerDown = (e, id) => {
    e.preventDefault();
    dragPointerId.current = e.pointerId;
    setDraggingId(id);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleGripPointerMove = (e) => {
    if (draggingId === null || e.pointerId !== dragPointerId.current) return;
    const y = e.clientY;
    let closestId = null;
    let closestDist = Infinity;
    let closestCenter = 0;
    for (const id of reorderIds) {
      if (id === draggingId) continue;
      const el = rowRefs.current[id];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const dist = Math.abs(center - y);
      if (dist < closestDist) { closestDist = dist; closestId = id; closestCenter = center; }
    }
    if (!closestId) return;
    setReorderIds((prev) => {
      const next = prev.filter((id) => id !== draggingId);
      // above the closest row's center -> insert before it; below -> after it
      // (otherwise there's no way to drag something to become the new last item)
      const idx = next.indexOf(closestId) + (y > closestCenter ? 1 : 0);
      next.splice(idx, 0, draggingId);
      return next;
    });
  };
  const handleGripPointerUp = () => {
    if (draggingId === null) return;
    reorderDay(selectedDay, reorderIds);
    setDraggingId(null);
    dragPointerId.current = null;
  };

  if (!authChecked) {
    return <div className="wk-root"><div className="wk-loading">불러오는 중…</div></div>;
  }

  if (!authUser) {
    return <AuthScreen onSignIn={signIn} onSignUp={signUp} error={authError} pending={authPending} />;
  }

  const rangeLabel = `${formatMD(weekDates[0])} – ${formatMD(weekDates[6])}`;
  const isThisWeek = weekOffset === 0;
  const activeList = selectedDay === null ? [] : tasksFor(selectedDay);
  const activeProgress = selectedDay === null ? { done: 0, total: 0 } : progressFor(selectedDay);
  const taskById = Object.fromEntries(activeList.map((t) => [t.id, t]));
  const checklistTask = checklistOpenId ? taskById[checklistOpenId] : null;
  const checklistTaskItems = checklistTask ? (checklistTask.checklist || []) : [];

  return (
    <div className="wk-root">
      <div className="wk-header">
        <div className="wk-account">
          <button className="wk-logout-btn" onClick={signOut}>로그아웃</button>
        </div>
        <div>
          <h1 className="wk-title">위클리 플래너</h1>
          <p className="wk-subtitle">나만의 주간 할 일 목록</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div className="wk-nav">
            <button className="wk-nav-btn" onClick={() => setWeekOffset((w) => w - 1)} aria-label="이전 주"><ChevronLeft size={16} /></button>
            <span className="wk-range">{rangeLabel}</span>
            <button className="wk-nav-btn" onClick={() => setWeekOffset((w) => w + 1)} aria-label="다음 주"><ChevronRight size={16} /></button>
            <button className="wk-today-btn" onClick={() => setWeekOffset(0)} disabled={isThisWeek}>이번 주</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="wk-loading">불러오는 중…</div>
      ) : (
        <>
          <div className="wk-strip">
            {weekDates.map((date, idx) => {
              const isToday = isSameDay(date, today);
              const isSelected = selectedDay === idx;
              const { done, total } = progressFor(idx);
              const hasContent = total > 0;
              const allComplete = hasContent && done === total;
              const dotClass = total === 0 ? "" : allComplete ? "all-done" : "has-tasks";
              return (
                <button
                  key={idx}
                  className={`wk-day-btn${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}${hasContent ? " has-content" : ""}${allComplete ? " all-complete" : ""}`}
                  onClick={() => setSelectedDay(idx)}
                >
                  {isToday && <span className="wk-today-mark" />}
                  {hasContent && <span className={`wk-day-badge${allComplete ? " all-complete" : ""}`}>{total}</span>}
                  <span className="wk-day-btn-name">{DAY_LABELS[idx]}</span>
                  <span className="wk-day-btn-date">{formatMD(date)}</span>
                  <span className={`wk-day-dot ${dotClass}`} />
                </button>
              );
            })}
          </div>

          {selectedDay !== null && (
            <div className={`wk-panel${isSameDay(weekDates[selectedDay], today) ? " is-today" : ""}`}>
              <div className="wk-panel-head">
                <div className="wk-tab-bg" />
                <div className="wk-panel-head-content">
                  <span>
                    <span className="wk-panel-day">{DAY_LABELS_FULL[selectedDay]}</span>
                    <span className="wk-panel-date">{formatMD(weekDates[selectedDay])}</span>
                  </span>
                  <span>
                    <span className="wk-panel-count">{activeProgress.total > 0 ? `${activeProgress.done}/${activeProgress.total}` : ""}</span>
                    <button
                      className={`wk-reorder-btn${reorderMode ? " is-active" : ""}`}
                      onClick={() => (reorderMode ? exitReorderMode() : enterReorderMode(activeList))}
                      disabled={!reorderMode && activeList.length < 2}
                    >
                      {reorderMode ? "완료" : "순서변경"}
                    </button>
                    <button className="wk-clear-btn" onClick={() => clearDay(selectedDay)} aria-label="이 요일 전체 삭제"><Trash2 size={13} /></button>
                  </span>
                </div>
              </div>

              <div className="wk-progress-track">
                <div className="wk-progress-fill" style={{ width: `${activeProgress.total ? (activeProgress.done / activeProgress.total) * 100 : 0}%` }} />
              </div>

              <div className="wk-list">
                {activeList.length === 0 && <div className="wk-empty">할 일이 없어요</div>}
                {reorderMode
                  ? reorderIds.map((id) => {
                      const t = taskById[id];
                      if (!t) return null;
                      return (
                        <div
                          key={id}
                          ref={(el) => { rowRefs.current[id] = el; }}
                          className={`wk-item wk-item-reorder${draggingId === id ? " is-dragging" : ""}`}
                          onPointerDown={(e) => handleGripPointerDown(e, id)}
                          onPointerMove={handleGripPointerMove}
                          onPointerUp={handleGripPointerUp}
                          onPointerCancel={handleGripPointerUp}
                          aria-label="순서 변경"
                        >
                          <span className="wk-grip-btn"><Grip size={15} /></span>
                          <span className={`wk-item-text${t.done ? " is-done" : ""}`}>{t.text}</span>
                          {t.carriedOver && t.originDate && <span className="wk-carried-badge">{t.originDate}</span>}
                        </div>
                      );
                    })
                  : activeList.map((t) => {
                      const checklist = t.checklist || [];
                      const checklistDone = checklist.filter((c) => c.done).length;
                      return (
                        <div key={t.id} className="wk-item">
                          {editingId === t.id ? (
                            <input
                              className="wk-edit-input"
                              value={editingText}
                              autoFocus
                              onChange={(e) => setEditingText(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                                if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                              }}
                            />
                          ) : (
                            <>
                              <button className={`wk-check${t.done ? " is-done" : ""}`} onClick={() => toggleDone(t.id)} aria-label={t.done ? "완료 취소" : "완료로 표시"}>
                                {t.done && <Check size={12} strokeWidth={3} />}
                              </button>
                              <span className={`wk-item-text${t.done ? " is-done" : ""}`}>{t.text}</span>
                              {t.carriedOver && t.originDate && <span className="wk-carried-badge">{t.originDate}</span>}
                              {checklist.length > 0 && <span className="wk-checklist-badge">{checklistDone}/{checklist.length}</span>}
                              <button className={`wk-checklist-btn${checklistOpenId === t.id ? " is-active" : ""}`} onClick={() => toggleChecklistOpen(t.id)} aria-label="세부 체크리스트">
                                <ListChecks size={13} />
                              </button>
                              <button className="wk-edit-btn" onClick={() => startEdit(t)} aria-label="수정"><Pencil size={13} /></button>
                              <button className="wk-del-btn" onClick={() => removeTask(t.id)} aria-label="삭제"><X size={14} /></button>
                            </>
                          )}
                        </div>
                      );
                    })}
              </div>

              {!reorderMode && (
                <div className="wk-add-row">
                  <input
                    className="wk-add-input"
                    placeholder="할 일을 입력하세요"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddTask(); }}
                  />
                  <button className="wk-add-btn" onClick={handleAddTask} aria-label="할 일 추가"><Plus size={15} /></button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!connectionOk && <div className="wk-warning">서버와 연결이 원활하지 않아요. 변경사항이 저장되지 않을 수 있어요.</div>}

      {checklistTask && (
        <div className="wk-modal-backdrop" onClick={closeChecklistModal}>
          <div className="wk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wk-modal-head">
              <span className="wk-modal-title">{checklistTask.text}</span>
              <button className="wk-modal-close" onClick={closeChecklistModal} aria-label="닫기"><X size={16} /></button>
            </div>
            <div className="wk-modal-body">
              {checklistTaskItems.length === 0 && <div className="wk-checklist-empty">세부 항목이 없어요</div>}
              {checklistTaskItems.map((c) => (
                <div key={c.id} className="wk-checklist-item">
                  {editingChecklistItemId === c.id ? (
                    <input
                      className="wk-checklist-edit-input"
                      value={editingChecklistText}
                      autoFocus
                      onChange={(e) => setEditingChecklistText(e.target.value)}
                      onBlur={() => commitEditChecklistItem(checklistTask.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); commitEditChecklistItem(checklistTask.id); }
                        if (e.key === "Escape") { e.preventDefault(); cancelEditChecklistItem(); }
                      }}
                    />
                  ) : (
                    <>
                      <button
                        className={`wk-checklist-check${c.done ? " is-done" : ""}`}
                        onClick={() => toggleChecklistItem(checklistTask.id, c.id)}
                        aria-label={c.done ? "완료 취소" : "완료로 표시"}
                      >
                        {c.done && <Check size={10} strokeWidth={3} />}
                      </button>
                      <span className={`wk-checklist-text${c.done ? " is-done" : ""}`}>{c.text}</span>
                      <button className="wk-checklist-edit-btn" onClick={() => startEditChecklistItem(c)} aria-label="세부 항목 수정">
                        <Pencil size={11} />
                      </button>
                      <button className="wk-checklist-del" onClick={() => removeChecklistItem(checklistTask.id, c.id)} aria-label="세부 항목 삭제">
                        <X size={11} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="wk-modal-footer">
              <div className="wk-checklist-add-row">
                <input
                  className="wk-checklist-input"
                  placeholder="세부 항목 추가"
                  value={checklistInput}
                  autoFocus
                  onChange={(e) => setChecklistInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddChecklistItem(checklistTask.id); }}
                />
                <button className="wk-checklist-add-btn" onClick={() => handleAddChecklistItem(checklistTask.id)} aria-label="세부 항목 추가">
                  <Plus size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

if (WeeklyPlannerAPI.firebaseReady) {
  try {
    ReactDOM.createRoot(document.getElementById("root")).render(<WeeklyPlanner />);
  } catch (e) {
    showFallback("실행 중 오류가 발생했습니다: " + e.message);
  }
}
