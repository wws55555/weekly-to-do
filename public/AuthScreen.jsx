// Email/password sign-in & sign-up. Shown by WeeklyPlanner.jsx whenever
// there's no signed-in user. Purely a form — owns only its own input state;
// the actual Firebase calls happen in useWeeklyTasks.js / firestoreApi.js.
function AuthScreen({ onSignIn, onSignUp, error, pending }) {
  const [mode, setMode] = React.useState("signin"); // "signin" | "signup"
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    const action = mode === "signup" ? onSignUp : onSignIn;
    action(email.trim(), password).catch(() => {}); // error is surfaced via `error` prop
  };

  return (
    <div className="auth-root">
      <div className="auth-card">
        <h1 className="wk-title">위클리 플래너</h1>
        <p className="wk-subtitle">나만의 주간 할 일 목록</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            className="auth-input"
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className="auth-input"
            type="password"
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-submit" type="submit" disabled={pending}>
            {pending ? "처리 중…" : mode === "signup" ? "회원가입" : "로그인"}
          </button>
        </form>

        <button
          className="auth-switch"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
        >
          {mode === "signup" ? "이미 계정이 있어요 — 로그인" : "계정이 없어요 — 회원가입"}
        </button>
      </div>
    </div>
  );
}
