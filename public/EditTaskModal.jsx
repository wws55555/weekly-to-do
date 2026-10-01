// Edit-task dialog, opened from a task's "수정" menu item. Lets the user
// change the task's text and its date (YYYY-MM-DD, picked from the same
// CalendarGrid the header's calendar uses, expanded inline under the field).
// Owns only its own input state; `onSave(text, dateKey)` decides what that
// means (same-day text edit, same-week day change, or cross-week move — see
// editTask in useWeeklyTasks.js).
function EditTaskModal({ initialText, initialDateKey, today, fetchMarks, onSave, onClose }) {
  const [text, setText] = React.useState(initialText);
  const [dateKey, setDateKey] = React.useState(initialDateKey);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const canSave = text.trim() !== "" && dateKey !== "";

  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dateLabel = `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")} (${DAY_LABELS[(date.getDay() + 6) % 7]})`;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSave) return;
    onSave(text, dateKey);
  };

  return (
    <div className="wk-modal-backdrop" onClick={onClose}>
      <div className="wk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wk-modal-head">
          <span className="wk-modal-title">플랜 수정</span>
          <button className="wk-modal-close" onClick={onClose} aria-label="닫기"><X size={16} /></button>
        </div>
        <form className="wk-edit-form" onSubmit={handleSubmit}>
          <label className="wk-edit-label">
            플랜
            <input
              className="auth-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="플랜을 입력하세요"
              autoFocus
            />
          </label>
          <div className="wk-edit-label">
            날짜
            {/* same month grid as the header's calendar (CalendarGrid), shown
                inline under the field rather than as a second modal */}
            <button
              type="button"
              className={`auth-input wk-edit-date-btn${calendarOpen ? " is-open" : ""}`}
              onClick={() => setCalendarOpen((v) => !v)}
            >
              <span>{dateLabel}</span>
              <CalendarIcon size={15} />
            </button>
            {calendarOpen && (
              <div className="wk-edit-calendar">
                <CalendarGrid
                  selectedDate={date}
                  today={today}
                  fetchMarks={fetchMarks}
                  onPick={(picked) => { setDateKey(toKey(picked)); setCalendarOpen(false); }}
                />
              </div>
            )}
          </div>
          <div className="wk-edit-actions">
            <button type="button" className="wk-edit-cancel" onClick={onClose}>취소</button>
            <button type="submit" className="auth-submit" disabled={!canSave}>저장</button>
          </div>
        </form>
      </div>
    </div>
  );
}
