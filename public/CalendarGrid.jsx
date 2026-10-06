// Month-grid date picker shared by the header's calendar modal and the
// edit-task modal's date field, so both look and behave the same (Monday-
// first, today outlined, selected date filled, per-date task markers).
// Owns which month is shown and that month's markers; everything else comes
// in as props. `fetchMarks(firstDate, lastDate)` is the hook's
// fetchCalendarMarks — re-run whenever the shown month changes, with a late
// response for a month already left dropped.
function CalendarGrid({ selectedDate, today, onPick, fetchMarks }) {
  const [month, setMonth] = React.useState(() => {
    const base = selectedDate || today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [marks, setMarks] = React.useState({});

  React.useEffect(() => {
    let cancelled = false;
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    fetchMarks(first, last)
      .then((next) => { if (!cancelled) setMarks(next); })
      .catch((e) => console.error("calendar markers failed", e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const shiftMonth = (delta) => setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const leadingBlanks = (new Date(year, monthIdx, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const cells = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIdx, i + 1)),
  ];

  return (
    <div className="wk-calendar">
      <div className="wk-calendar-nav">
        <button type="button" className="wk-nav-btn" onClick={() => shiftMonth(-1)} aria-label="이전 달"><ChevronLeft size={16} /></button>
        <span className="wk-calendar-month">{year}.{String(monthIdx + 1).padStart(2, "0")}</span>
        <button type="button" className="wk-nav-btn" onClick={() => shiftMonth(1)} aria-label="다음 달"><ChevronRight size={16} /></button>
      </div>
      <div className="wk-calendar-grid">
        {DAY_LABELS.map((label) => (
          <span key={label} className="wk-calendar-weekday">{label}</span>
        ))}
        {cells.map((cellDate, idx) =>
          cellDate === null ? (
            <span key={`b${idx}`} className="wk-calendar-cell is-empty" />
          ) : (
            <button
              type="button"
              key={toKey(cellDate)}
              className={`wk-calendar-cell${isSameDay(cellDate, today) ? " is-today" : ""}${selectedDate && isSameDay(cellDate, selectedDate) ? " is-selected" : ""}`}
              onClick={() => onPick(cellDate)}
            >
              {cellDate.getDate()}
              {marks[toKey(cellDate)] && <span className={`wk-calendar-dot is-${marks[toKey(cellDate)]}`} />}
            </button>
          )
        )}
      </div>
    </div>
  );
}
