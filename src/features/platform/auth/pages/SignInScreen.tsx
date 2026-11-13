import { useState } from "react";
import { useSearchParams } from "react-router";
import { LoginPage } from "./LoginPage";
import { ForgotPasswordPage } from "./ForgotPasswordPage";
import { ResetPasswordPage } from "./ResetPasswordPage";

// What a signed-out visitor sees on every staff page. There is no /login URL: the page asked for stays in
// the address bar, and once the server confirms the session (GET /api/auth/me) that page appears in its
// place. Forgot password and the emailed reset link (/?reset_token=...) are views of this same screen.
export const RESET_TOKEN_PARAM = "reset_token";

export function SignInScreen() {
  const [params, setParams] = useSearchParams();
  const resetToken = params.get(RESET_TOKEN_PARAM);
  const [view, setView] = useState<"login" | "forgot">("login");

  function leaveReset() {
    const next = new URLSearchParams(params);
    next.delete(RESET_TOKEN_PARAM);
    setParams(next, { replace: true });
    setView("login");
  }

  if (resetToken !== null) return <ResetPasswordPage token={resetToken} onBack={leaveReset} />;
  if (view === "forgot") return <ForgotPasswordPage onBack={() => setView("login")} />;
  return <LoginPage onForgot={() => setView("forgot")} />;
}
