"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/admin/actions";

/** A form for an admin server action, showing its error or success message. */
export function AdminForm({ action, submit, children, className = "" }: {
 action: (prev: FormState, data: FormData) => Promise<FormState>;
 submit: string;
 children: React.ReactNode;
 className?: string;
}) {
 const [state, formAction, pending] = useActionState(action, {});
 return <form action={formAction} className={`admin-form ${className}`}>
  {children}
  {state.error && <p className="admin-error" role="alert">{state.error}</p>}
  {state.ok && <p className="admin-ok" role="status">{state.ok}</p>}
  <button type="submit" disabled={pending}>{pending ? "Saving…" : submit}</button>
 </form>;
}
