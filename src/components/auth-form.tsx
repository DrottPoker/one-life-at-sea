"use client";

import { auth } from "@/config/public";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { register, logIn, sendReset, changePassword } from "@/app/actions";
import { normalizeCharacterName, validateCharacterName, type FormState } from "@/lib/validation";
import { useHydrated } from "@/hooks/use-hydrated";

type Mode = "register" | "login" | "forgot" | "reset";
const actions = { register, login: logIn, forgot: sendReset, reset: changePassword };
const labels = { register: "Create account", login: "Log in", forgot: "Send reset link", reset: "Save new password" };

export function AuthForm({ mode, initialEmail = "" }: { mode: Mode; initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const hydrated = useHydrated();
  const [remaining, setRemaining] = useState(0);
  const [state, action, pending] = useActionState(async (previous: FormState, data: FormData) => {
    const result = await actions[mode](previous, data);
    if (result.retryAfter) setRemaining(result.retryAfter);
    return result;
  }, {});
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setRemaining(remaining - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  const nameError = (name ? validateCharacterName(name) : undefined) ?? (name === state.name ? state.errors?.name : undefined);
  const hasPassword = ["register", "login", "reset"].includes(mode);
  const hasConfirmation = mode === "register" || mode === "reset";
  return <>
    <form action={action} className="o-form" aria-busy={pending}>
      {state.message && <p className={`o-notice ${state.success ? "" : "o-error"}`} role={state.success ? "status" : "alert"}>{state.message}</p>}
      <fieldset disabled={pending}>
        {mode === "register" && <label className="o-field" htmlFor="character-name"><span className="o-field-label" id="character-name-label">Character name</span>
          <input aria-labelledby="character-name-label" id="character-name" name="name" value={name} onChange={event => { setName(event.target.value); event.currentTarget.setCustomValidity(validateCharacterName(event.target.value) ?? ""); }} required
            autoComplete="off" spellCheck={false} aria-invalid={!!nameError} aria-describedby="name-hint name-error" />
          <small className="o-form-hint" id="name-hint">No numbers or spaces. Choose an available name.</small>
          <small className="o-field-error" id="name-error" role="alert">{nameError}</small>
        </label>}
        {mode !== "reset" && <label className="o-field" htmlFor="email"><span className="o-field-label" id="email-label">Email address</span>
          <input aria-labelledby="email-label" id="email" name="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={auth.emailMaxLength}
            aria-invalid={!!state.errors?.email} aria-describedby={state.errors?.email ? "email-error" : undefined} />
          {state.errors?.email && <small id="email-error" className="o-field-error" role="alert">{state.errors.email}</small>}
        </label>}
        {hasPassword && <label className="o-field" htmlFor="password"><span className="o-field-label" id="password-label">{mode === "reset" ? "New password" : "Password"}</span>
          <span className="o-password-row"><input aria-labelledby="password-label" id="password" name="password" type={showPassword ? "text" : "password"}
            autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? 1 : auth.passwordMinLength} maxLength={auth.passwordMaxLength}
            aria-invalid={!!state.errors?.password} aria-describedby="password-hint" />
            <button type="button" className="o-password-toggle" disabled={!hydrated} onClick={() => setShowPassword(!showPassword)} aria-controls="password">{showPassword ? "Hide" : "Show"}</button>
          </span><small id="password-hint" className={state.errors?.password ? "o-field-error" : "o-form-hint"} role={state.errors?.password ? "alert" : undefined}>
            {state.errors?.password ?? (mode === "login" ? "Enter the password for your account." : `At least ${auth.passwordMinLength} characters. No special characters required.`)}
          </small>
        </label>}
        {hasConfirmation && <label className="o-field" htmlFor="confirm-password"><span className="o-field-label" id="confirm-password-label">Confirm password</span>
          <input aria-labelledby="confirm-password-label" id="confirm-password" name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={auth.passwordMinLength} maxLength={auth.passwordMaxLength}
            aria-invalid={!!state.errors?.confirmPassword} aria-describedby={state.errors?.confirmPassword ? "confirm-error" : undefined} />
          {state.errors?.confirmPassword && <small className="o-field-error" id="confirm-error" role="alert">{state.errors.confirmPassword}</small>}
        </label>}
        {mode === "register" && <div className="o-name-proof" aria-live="polite"><small>Your name will appear as</small><span>{normalizeCharacterName(name) || "Your name"}</span></div>}
        <div className="o-form-actions"><button type="submit" className="o-primary" disabled={pending || remaining > 0}>{pending ? "Please wait..." : remaining > 0 ? `Try again in ${remaining}s` : labels[mode]}</button>
          {mode === "login" && <Link href="/forgot-password" className="o-text-button">Forgot password?</Link>}
        </div>
      </fieldset>
    </form>
    <div className="o-panel-foot">{mode === "login" ? <Link href="/register">New to the sea? Create account</Link> : <Link href="/login">{mode === "register" ? "Already have an account? Log in" : "Back to log in"}</Link>}</div>
  </>;
}
