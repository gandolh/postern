// The two-step sign-in form: email and password, then the TOTP code when the
// account has 2-step verification on. Both forms are method="post", so even a
// submit that skipped onSubmit could never put the password in a URL. Used by the sign-in page and by the
// session-expired dialog (where the account is fixed).
//
// Every attempt is a click or Enter: nothing here retries on its own, because
// each failure counts towards Stalwart's ban. The password stays in this
// component's state only until the code step is done, and goes when it unmounts.

import type { SignInOutcome } from "@postern/jmap";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { isRejected, signInErrorMessage, type SignInStep } from "./messages";

export interface SignInFormProps {
  /** One attempt. Resolves `mfaRequired` when the code is needed; throws SignInError otherwise. */
  onSignIn: (username: string, password: string, mfaToken?: string) => Promise<SignInOutcome>;
  /** The fixed account, in the session-expired dialog. */
  username?: string;
  /** The password step's heading and line under it. */
  title: string;
  subtitle: ReactNode;
  /** 1 on the page, 2 in the dialog. */
  headingLevel?: 1 | 2;
  /** Extra actions beside Next on the password step (Sign out, in the dialog). */
  secondary?: ReactNode;
}

const CODE = /^\d{6,8}$/;

export function SignInForm({
  onSignIn,
  username: fixedUsername,
  title,
  subtitle,
  headingLevel = 1,
  secondary,
}: SignInFormProps) {
  const id = useId();
  const [step, setStep] = useState<SignInStep>("password");
  const [email, setEmail] = useState(fixedUsername ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const errorId = `${id}-error`;
  const username = fixedUsername ?? email.trim();

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function attempt(mfaToken: string | undefined): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const outcome = await onSignIn(username, password, mfaToken);
      if (outcome === "mfaRequired") {
        setCode("");
        setStep("code");
      }
      // On success the caller swaps this form out.
    } catch (err) {
      setError(signInErrorMessage(err, mfaToken === undefined ? "password" : "code"));
      if (mfaToken === undefined) {
        if (isRejected(err)) setPassword("");
        passwordRef.current?.focus();
      } else {
        if (isRejected(err)) setCode("");
        codeRef.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  }

  function submitPassword(event: FormEvent): void {
    event.preventDefault();
    if (busy) return;
    if (!username) {
      setError("Enter your email address.");
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setError("Enter your password.");
      passwordRef.current?.focus();
      return;
    }
    void attempt(undefined);
  }

  function submitCode(event: FormEvent): void {
    event.preventDefault();
    if (busy) return;
    const digits = code.replace(/\s+/g, "");
    if (!CODE.test(digits)) {
      setError("Enter the 6-digit code from your authenticator app.");
      codeRef.current?.focus();
      return;
    }
    void attempt(digits);
  }

  function startOver(): void {
    setStep("password");
    setPassword("");
    setCode("");
    setError(undefined);
  }

  const errorLine = error ? (
    <p id={errorId} className="m-0 font-medium text-danger" role="alert">
      {error}
    </p>
  ) : null;

  if (step === "code") {
    return (
      <form
        className="flex flex-col gap-2 [&_:is(input[type=email],input[type=password],input[type=text])]:min-h-11 [&_:is(input[type=email],input[type=password],input[type=text])]:rounded-md [&_:is(input[type=email],input[type=password],input[type=text])]:border [&_:is(input[type=email],input[type=password],input[type=text])]:border-border-strong [&_:is(input[type=email],input[type=password],input[type=text])]:bg-surface [&_:is(input[type=email],input[type=password],input[type=text])]:px-3 [&_:is(input[type=email],input[type=password],input[type=text])]:text-lg [&_:is(input[type=email],input[type=password],input[type=text])]:text-text [&_:is(input[type=email],input[type=password],input[type=text])]:focus-visible:border-focus [&_:is(input[type=email],input[type=password],input[type=text])]:focus-visible:[outline:var(--focus-ring)] [&_:is(input[type=email],input[type=password],input[type=text])]:focus-visible:-outline-offset-1 [&_h1]:m-0 [&_h1]:text-2xl [&_h1]:leading-tight [&_h1]:font-semibold [&_h2]:m-0 [&_h2]:text-2xl [&_h2]:leading-tight [&_h2]:font-semibold [&_input[aria-invalid=true]]:border-danger [&_label]:text-sm [&_label]:font-medium"
        method="post"
        onSubmit={submitCode}
        noValidate
        aria-busy={busy}
      >
        <Heading>2-step verification</Heading>
        <p className="m-0 mb-3 text-text-muted">This extra step shows it's really you signing in.</p>
        <p className="m-0 mb-2 self-start rounded-pill border border-border-strong px-3 py-1 text-sm">{username}</p>
        <label htmlFor={`${id}-code`}>Enter the code</label>
        <input
          ref={codeRef}
          id={`${id}-code`}
          name="one-time-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={10}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : `${id}-code-help`}
        />
        <p id={`${id}-code-help`} className="m-0 mb-3 text-text-muted">
          Get a verification code from your authenticator app.
        </p>
        {errorLine}
        <div className="mt-4 flex items-center justify-end gap-4 [&_button:disabled]:cursor-default [&_button:disabled]:opacity-60 [&_button[type=submit]]:min-h-10 [&_button[type=submit]]:cursor-pointer [&_button[type=submit]]:rounded-md [&_button[type=submit]]:bg-accent [&_button[type=submit]]:px-6 [&_button[type=submit]]:font-semibold [&_button[type=submit]]:text-on-accent [&_button[type=submit]]:transition-[background-color] [&_button[type=submit]]:duration-(--duration-fast) [&_button[type=submit]]:ease-out [&_button[type=submit]]:hover:bg-accent-hover">
          <button
            type="button"
            className="cursor-pointer bg-transparent py-2 font-medium text-accent hover:text-accent-hover hover:underline"
            onClick={startOver}
            disabled={busy}
          >
            {fixedUsername ? "Back" : "Use another account"}
          </button>
          <button type="submit" disabled={busy}>
            {busy ? "Checking…" : "Next"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 [&_:is(input[type=email],input[type=password],input[type=text])]:min-h-11 [&_:is(input[type=email],input[type=password],input[type=text])]:rounded-md [&_:is(input[type=email],input[type=password],input[type=text])]:border [&_:is(input[type=email],input[type=password],input[type=text])]:border-border-strong [&_:is(input[type=email],input[type=password],input[type=text])]:bg-surface [&_:is(input[type=email],input[type=password],input[type=text])]:px-3 [&_:is(input[type=email],input[type=password],input[type=text])]:text-lg [&_:is(input[type=email],input[type=password],input[type=text])]:text-text [&_:is(input[type=email],input[type=password],input[type=text])]:focus-visible:border-focus [&_:is(input[type=email],input[type=password],input[type=text])]:focus-visible:[outline:var(--focus-ring)] [&_:is(input[type=email],input[type=password],input[type=text])]:focus-visible:-outline-offset-1 [&_h1]:m-0 [&_h1]:text-2xl [&_h1]:leading-tight [&_h1]:font-semibold [&_h2]:m-0 [&_h2]:text-2xl [&_h2]:leading-tight [&_h2]:font-semibold [&_input[aria-invalid=true]]:border-danger [&_label]:text-sm [&_label]:font-medium"
      method="post"
      onSubmit={submitPassword}
      noValidate
      aria-busy={busy}
    >
      <Heading>{title}</Heading>
      <p className="m-0 mb-3 text-text-muted">{subtitle}</p>
      {fixedUsername ? (
        <>
          {/* For password managers: the account this password belongs to. */}
          <input
            className="sr-only"
            type="email"
            name="username"
            autoComplete="username"
            value={fixedUsername}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
          />
          <p className="m-0 mb-2 self-start rounded-pill border border-border-strong px-3 py-1 text-sm">
            {fixedUsername}
          </p>
        </>
      ) : (
        <>
          <label htmlFor={`${id}-email`}>Email</label>
          <input
            ref={emailRef}
            id={`${id}-email`}
            name="username"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error && !username ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </>
      )}
      <label htmlFor={`${id}-password`}>Password</label>
      <input
        ref={passwordRef}
        id={`${id}-password`}
        name="password"
        type={showPassword ? "text" : "password"}
        autoComplete="current-password"
        autoFocus={Boolean(fixedUsername)}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-invalid={error && username ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      <label className="flex min-h-8 cursor-pointer items-center gap-2 [&_input]:m-0 [&_input]:size-4.5">
        <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
        Show password
      </label>
      {errorLine}
      <div className="mt-4 flex items-center justify-end gap-4 [&_button:disabled]:cursor-default [&_button:disabled]:opacity-60 [&_button[type=submit]]:min-h-10 [&_button[type=submit]]:cursor-pointer [&_button[type=submit]]:rounded-md [&_button[type=submit]]:bg-accent [&_button[type=submit]]:px-6 [&_button[type=submit]]:font-semibold [&_button[type=submit]]:text-on-accent [&_button[type=submit]]:transition-[background-color] [&_button[type=submit]]:duration-(--duration-fast) [&_button[type=submit]]:ease-out [&_button[type=submit]]:hover:bg-accent-hover">
        {secondary}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Next"}
        </button>
      </div>
    </form>
  );
}
