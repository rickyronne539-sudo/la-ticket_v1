import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminConfigured, isAdmin } from "@/lib/admin";
import { AdminForm } from "@/components/admin-form";
import { login } from "../actions";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default async function AdminLogin() {
 if (await isAdmin()) redirect("/admin");
 return <div className="admin-page admin-narrow">
  <h1>Admin sign in</h1>
  {adminConfigured() ? <AdminForm action={login} submit="Sign in">
   <label>Password<input type="password" name="password" required autoComplete="current-password" autoFocus/></label>
  </AdminForm> : <p className="admin-error">Admin is switched off. Add <code>ADMIN_PASSWORD</code> (at least 10 characters) to <code>.env</code> and restart the server.</p>}
 </div>;
}
