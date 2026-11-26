import { useState } from "react";
import { useAuth } from "../AuthContext";
import { AuthFrame, AuthHeading } from "../components/AuthFrame";
import { RecoveryCodes, SetupPanel } from "../components/TwoFactor";

// Shown in place of the app to someone already signed in when an admin made two-factor sign-in required for them.
// The server enforces it at every sign-in; this asks before their current session goes on.
export function MfaRequiredScreen() {
  const { refresh, logout } = useAuth();
  const [codes, setCodes] = useState<string[] | null>(null);

  if (codes) {
    return (
      <AuthFrame>
        <AuthHeading eyebrow="Two-factor sign-in is on" title="Save your recovery codes" />
        <RecoveryCodes codes={codes} />
        <button type="button" className="si-submit" onClick={() => { void refresh(); }}>I've saved them, continue</button>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame>
      <AuthHeading eyebrow="Two-factor sign-in" title="Set up two-factor sign-in" onBack={() => { void logout(); }} backLabel="Sign out">
        Your administrator now requires a code from your phone as well as your password. Set it up to carry on.
      </AuthHeading>
      <SetupPanel variant="signin" startUrl="/api/auth/mfa/setup" confirmUrl="/api/auth/mfa/confirm" onDone={setCodes} />
    </AuthFrame>
  );
}
