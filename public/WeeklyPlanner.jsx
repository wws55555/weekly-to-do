// Pure UI: renders whatever useWeeklyTasks() gives it. No Firestore calls,
// no carry-over logic live here — see useWeeklyTasks.js / firestoreApi.js.
function WeeklyPlanner() {
  const [inputText, setInputText] = React.useState("");
  const [editingId, setEditingId] = React.useState(null);
  const [editingText, setEditingText] = React.useState("");
  const {
    authUser, authChecked, authError, authPending, signUp, signIn, signOut,
    weekOffset, setWeekOffset,
    connectionOk, loading,
    selectedDay, setSelectedDay,
    today, weekDates,
    addTask, editTask, toggleDone, toggleImportant, removeTask, clearDay,
    tasksFor, progressFor, weekProgress,
  } = useWeeklyTasks();

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

  return (
    <div className="wk-root">
      <div className="wk-header">
        <div>
          <h1 className="wk-title">위클리 플래너</h1>
          <p className="wk-subtitle">나만의 주간 할 일 목록</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div className="wk-account">
            <span className="wk-account-email">{authUser.email}</span>
            <button className="wk-logout-btn" onClick={signOut}>로그아웃</button>
          </div>
          <div className="wk-nav">
            <button className="wk-nav-btn" onClick={() => setWeekOffset((w) => w - 1)} aria-label="이전 주"><ChevronLeft size={16} /></button>
            <span className="wk-range">{rangeLabel}</span>
            <button className="wk-nav-btn" onClick={() => setWeekOffset((w) => w + 1)} aria-label="다음 주"><ChevronRight size={16} /></button>
            <button className="wk-today-btn" onClick={() => setWeekOffset(0)} disabled={isThisWeek}>이번 주</button>
          </div>
          <div className="wk-stamp">
            <div className="wk-stamp-ring" style={{ background: `conic-gradient(#3B6255 ${weekProgress.pct * 3.6}deg, #DADFD5 0deg)` }}>
              <div className="wk-stamp-inner">{weekProgress.pct}%</div>
            </div>
            <div className="wk-stamp-text">이번 주 완료<br /><b>{weekProgress.done}</b> / {weekProgress.total}</div>
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
                    <button className="wk-clear-btn" onClick={() => clearDay(selectedDay)} aria-label="이 요일 전체 삭제"><Trash2 size={13} /></button>
                  </span>
                </div>
              </div>

              <div className="wk-progress-track">
                <div className="wk-progress-fill" style={{ width: `${activeProgress.total ? (activeProgress.done / activeProgress.total) * 100 : 0}%` }} />
              </div>

              <div className="wk-list">
                {activeList.length === 0 && <div className="wk-empty">할 일이 없어요</div>}
                {activeList.map((t) => (
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
                        <button className="wk-edit-btn" onClick={() => startEdit(t)} aria-label="수정"><Pencil size={13} /></button>
                        <button className={`wk-star-btn${t.important ? " is-active" : ""}`} onClick={() => toggleImportant(t.id)} aria-label="중요 표시">
                          <Star size={14} fill={t.important ? "currentColor" : "none"} />
                        </button>
                        <button className="wk-del-btn" onClick={() => removeTask(t.id)} aria-label="삭제"><X size={14} /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>

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
            </div>
          )}
        </>
      )}

      {!connectionOk && <div className="wk-warning">서버와 연결이 원활하지 않아요. 변경사항이 저장되지 않을 수 있어요.</div>}
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
