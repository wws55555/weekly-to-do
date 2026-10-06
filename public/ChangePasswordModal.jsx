// Change-password dialog, opened from the account dropdown in the planner
// header. Owns only its own input state; the actual re-auth + update happens
// via the `onSubmit` prop (useWeeklyTasks.js → firestoreApi.js), which rejects
// with an Error whose message is already user-facing text.
function ChangePasswordModal({ onSubmit, onClose }) {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState(null);
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pending) return;
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("모든 칸을 입력해주세요.");
      return;
    }
    if (newPassword.length < 6) {
      setError("새 비밀번호는 6자 이상이어야 해요.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 서로 일치하지 않아요.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("현재 비밀번호와 다른 비밀번호를 입력해주세요.");
      return;
    }
    setError(null);
    setPending(true);
    onSubmit(currentPassword, newPassword)
      .then(() => setDone(true))
      .catch((err) => setError(err.message))
      .finally(() => setPending(false));
  };

  return (
    <div className="wk-modal-backdrop" onClick={onClose}>
      <div className="wk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wk-modal-head">
          <span className="wk-modal-title">비밀번호 변경</span>
          <button className="wk-modal-close" onClick={onClose} aria-label="닫기"><X size={16} /></button>
        </div>
        {done ? (
          <div className="wk-password-form">
            <div className="wk-password-success">비밀번호가 변경되었어요.</div>
            <button className="auth-submit" onClick={onClose}>확인</button>
          </div>
        ) : (
          <form className="wk-password-form" onSubmit={handleSubmit}>
            <input
              className="auth-input"
              type="password"
              placeholder="현재 비밀번호"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
            <input
              className="auth-input"
              type="password"
              placeholder="새 비밀번호 (6자 이상)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <input
              className="auth-input"
              type="password"
              placeholder="새 비밀번호 확인"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-submit" type="submit" disabled={pending}>
              {pending ? "처리 중…" : "변경하기"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
