"use client";
import { useActionState, useState } from "react";
import { authenticate } from "@/app/account/actions";

export function CustomerForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState("");
  const [state, action, pending] = useActionState(authenticate, {});
  return <form action={action} className="space-y-5">
    <h1 className="text-3xl font-bold">{mode === "register" ? "Create your account" : "Sign in"}</h1>
    <p>Create an account or sign in before booking. Payment receipts go to your account email.</p>
    <input type="hidden" name="mode" value={mode}/><input type="hidden" name="next" value={next}/>
    <label className="block">Email<input className="block w-full rounded border p-3" type="email" name="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} autoComplete="email"/></label>
    <label className="block">Password<input className="block w-full rounded border p-3" type="password" name="password" required minLength={12} maxLength={128} autoComplete={mode === "register" ? "new-password" : "current-password"}/><small>At least 12 characters.</small></label>
    {state.error && <p role="alert" className="text-red-700">{state.error}</p>}
    <button disabled={pending} className="ticket-button w-full">{pending ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}</button>
    <button type="button" className="underline" onClick={() => setMode(mode === "register" ? "login" : "register")}>{mode === "register" ? "Already have an account? Sign in" : "New here? Create an account"}</button>
  </form>;
}
