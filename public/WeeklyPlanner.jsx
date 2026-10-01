// Pure UI: renders whatever useWeeklyTasks() gives it. No Firestore calls,
// no carry-over logic live here — see useWeeklyTasks.js / firestoreApi.js.
function WeeklyPlanner() {
  const [inputText, setInputText] = React.useState("");
  const [editingId, setEditingId] = React.useState(null);
  const [reorderMode, setReorderMode] = React.useState(false);
  const [reorderIds, setReorderIds] = React.useState([]);
  const [draggingId, setDraggingId] = React.useState(null);
  const [checklistOpenId, setChecklistOpenId] = React.useState(null);
  const [itemMenuOpenId, setItemMenuOpenId] = React.useState(null);
  const [panelMenuOpen, setPanelMenuOpen] = React.useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = React.useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = React.useState(false);
  const [checklistInput, setChecklistInput] = React.useState("");
  const [editingChecklistItemId, setEditingChecklistItemId] = React.useState(null);
  const [editingChecklistText, setEditingChecklistText] = React.useState("");
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const rowRefs = React.useRef({});
  const dragPointerId = React.useRef(null);
  const suppressPopRef = React.useRef(false);
  const suppressCalendarPopRef = React.useRef(false);
  const suppressPasswordPopRef = React.useRef(false);
  const suppressEditPopRef = React.useRef(false);
  const {
    authUser, authChecked, authError, authPending, signUp, signIn, signOut, changePassword,
    fetchCalendarMarks,
    connectionOk, loading,
    selectedDay, setSelectedDay, goToDate,
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
    setItemMenuOpenId(null);
    setPanelMenuOpen(false);
    setEditingId(null);
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

  // same pattern as the checklist modal above: push a history entry while
  // the calendar is open so the hardware back button closes it instead of
  // exiting the app
  React.useEffect(() => {
    if (!calendarOpen) return;
    window.history.pushState({ wkModal: true }, "");
    const onPopState = () => {
      suppressCalendarPopRef.current = true;
      setCalendarOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!suppressCalendarPopRef.current) window.history.back();
      suppressCalendarPopRef.current = false;
    };
  }, [calendarOpen]);

  // same back-button pattern for the edit-task modal
  React.useEffect(() => {
    if (!editingId) return;
    window.history.pushState({ wkModal: true }, "");
    const onPopState = () => {
      suppressEditPopRef.current = true;
      setEditingId(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!suppressEditPopRef.current) window.history.back();
      suppressEditPopRef.current = false;
    };
  }, [editingId]);

  // same back-button pattern for the change-password modal
  React.useEffect(() => {
    if (!passwordModalOpen) return;
    window.history.pushState({ wkModal: true }, "");
    const onPopState = () => {
      suppressPasswordPopRef.current = true;
      setPasswordModalOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!suppressPasswordPopRef.current) window.history.back();
      suppressPasswordPopRef.current = false;
    };
  }, [passwordModalOpen]);

  const openCalendar = () => setCalendarOpen(true);
  const closeCalendar = () => setCalendarOpen(false);
  const pickCalendarDate = (date) => {
    goToDate(date);
    setCalendarOpen(false);
  };

  const handleAddTask = () => {
    addTask(inputText, selectedDay);
    setInputText("");
  };

  // the edit modal works on whichever task editingId names; every task in the
  // current day panel shares that panel's date, so that's the initial date
  const startEdit = (t) => setEditingId(t.id);
  const saveEdit = (text, dateKey) => {
    const originalDateKey = toKey(weekDates[selectedDay]);
    if (dateKey !== originalDateKey) {
      const [y, m, d] = dateKey.split("-").map(Number);
      editTask(editingId, text, new Date(y, m - 1, d));
    } else {
      editTask(editingId, text);
    }
    setEditingId(null);
  };
  const closeEditModal = () => setEditingId(null);

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

  const toggleItemMenu = (id) => setItemMenuOpenId((prev) => (prev === id ? null : id));
  const closeItemMenu = () => setItemMenuOpenId(null);

  const enterReorderMode = (list) => {
    setChecklistOpenId(null);
    setItemMenuOpenId(null);
    setPanelMenuOpen(false);
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

  const isToday = selectedDay !== null && isSameDay(weekDates[selectedDay], today);
  const activeList = selectedDay === null ? [] : tasksFor(selectedDay);
  const activeProgress = selectedDay === null ? { done: 0, total: 0 } : progressFor(selectedDay);
  const taskById = Object.fromEntries(activeList.map((t) => [t.id, t]));
  const checklistTask = checklistOpenId ? taskById[checklistOpenId] : null;
  const checklistTaskItems = checklistTask ? (checklistTask.checklist || []) : [];
  const editingTask = editingId ? taskById[editingId] : null;

  return (
    <div className="wk-root">
      <div className="wk-header">
        <div>
          <h1 className="wk-title">데일리 플래너</h1>
        </div>
        <div className="wk-header-actions">
          <div className="wk-item-menu">
            <button className={`wk-account-btn${accountMenuOpen ? " is-active" : ""}`} onClick={() => setAccountMenuOpen((v) => !v)} aria-label="계정">
              <UserIcon size={16} />
            </button>
            {accountMenuOpen && (
              <>
                <div className="wk-menu-backdrop" onClick={() => setAccountMenuOpen(false)} />
                <div className="wk-item-menu-dropdown">
                  <button onClick={() => { setAccountMenuOpen(false); setPasswordModalOpen(true); }}>
                    <KeyRound size={13} /> 비밀번호 변경
                  </button>
                  <button className="is-danger" onClick={() => { setAccountMenuOpen(false); signOut(); }}>
                    <LogOut size={13} /> 로그아웃
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="wk-header-nav">
            <button className="wk-today-btn" onClick={() => goToDate(today)} disabled={isToday}>오늘</button>
            <button className="wk-calendar-btn" onClick={openCalendar} aria-label="달력 열기">
              <CalendarIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="wk-loading">불러오는 중…</div>
      ) : (
        <>
          {selectedDay !== null && (
            <div className={`wk-panel${isToday ? " is-today" : ""}`}>
              <div className="wk-panel-head">
                <div className="wk-tab-bg" />
                <div className="wk-panel-head-content">
                  <span>
                    <span className="wk-panel-day">{formatMD(weekDates[selectedDay])}</span>
                    <span className="wk-panel-date">({DAY_LABELS[selectedDay]})</span>
                  </span>
                  <span className="wk-panel-actions">
                    <span className="wk-panel-count">{activeProgress.total > 0 ? `${activeProgress.done}/${activeProgress.total}` : ""}</span>
                    {reorderMode ? (
                      <button className="wk-reorder-btn is-active" onClick={exitReorderMode}>완료</button>
                    ) : (
                      <div className="wk-item-menu">
                        <button className={`wk-item-menu-btn${panelMenuOpen ? " is-active" : ""}`} onClick={() => setPanelMenuOpen((v) => !v)} aria-label="더보기">
                          <MoreVertical size={16} />
                        </button>
                        {panelMenuOpen && (
                          <>
                            <div className="wk-menu-backdrop" onClick={() => setPanelMenuOpen(false)} />
                            <div className="wk-item-menu-dropdown">
                              <button disabled={activeList.length < 2} onClick={() => enterReorderMode(activeList)}>
                                <Grip size={13} /> 순서변경
                              </button>
                              <button className="is-danger" disabled={activeList.length === 0} onClick={() => { clearDay(selectedDay); setPanelMenuOpen(false); }}>
                                <Trash2 size={13} /> 전체 삭제
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
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
                          <button className={`wk-check${t.done ? " is-done" : ""}`} onClick={() => toggleDone(t.id)} aria-label={t.done ? "완료 취소" : "완료로 표시"}>
                            {t.done && <Check size={12} strokeWidth={3} />}
                          </button>
                          <span className={`wk-item-text${t.done ? " is-done" : ""}`}>{t.text}</span>
                          {t.carriedOver && t.originDate && <span className="wk-carried-badge">{t.originDate}</span>}
                          {checklist.length > 0 && (
                            <button className="wk-checklist-badge" onClick={() => toggleChecklistOpen(t.id)} aria-label="상세 열기">
                              {checklistDone}/{checklist.length}
                            </button>
                          )}
                          <div className="wk-item-menu">
                            <button className={`wk-item-menu-btn${itemMenuOpenId === t.id ? " is-active" : ""}`} onClick={() => toggleItemMenu(t.id)} aria-label="더보기">
                              <MoreVertical size={15} />
                            </button>
                            {itemMenuOpenId === t.id && (
                              <>
                                <div className="wk-menu-backdrop" onClick={closeItemMenu} />
                                <div className="wk-item-menu-dropdown">
                                  <button onClick={() => { toggleChecklistOpen(t.id); closeItemMenu(); }}>
                                    <ListChecks size={13} /> 상세
                                  </button>
                                  <button onClick={() => { startEdit(t); closeItemMenu(); }}>
                                    <Pencil size={13} /> 수정
                                  </button>
                                  <button className="is-danger" onClick={() => { removeTask(t.id); closeItemMenu(); }}>
                                    <X size={13} /> 삭제
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
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

      {calendarOpen && (
        <div className="wk-modal-backdrop" onClick={closeCalendar}>
          <div className="wk-modal wk-calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wk-modal-head">
              <span className="wk-modal-title">날짜 선택</span>
              <button className="wk-modal-close" onClick={closeCalendar} aria-label="닫기"><X size={16} /></button>
            </div>
            <CalendarGrid
              selectedDate={selectedDay !== null ? weekDates[selectedDay] : null}
              today={today}
              onPick={pickCalendarDate}
              fetchMarks={fetchCalendarMarks}
            />
          </div>
        </div>
      )}

      {editingTask && (
        <EditTaskModal
          key={editingTask.id}
          initialText={editingTask.text}
          initialDateKey={toKey(weekDates[selectedDay])}
          today={today}
          fetchMarks={fetchCalendarMarks}
          onSave={saveEdit}
          onClose={closeEditModal}
        />
      )}

      {passwordModalOpen && (
        <ChangePasswordModal onSubmit={changePassword} onClose={() => setPasswordModalOpen(false)} />
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
