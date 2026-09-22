const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const DAY_LABELS_FULL = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setHours(0, 0, 0, 0);
  d.setDate(diff);
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatMD(date) { return `${date.getMonth() + 1}.${date.getDate()}`; }
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
