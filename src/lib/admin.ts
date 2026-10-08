import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// One shared admin password from the environment (ADMIN_PASSWORD). A successful
// login gets a signed, expiring, httpOnly cookie; nothing is stored server-side.
const COOKIE = "la_admin";
const HOURS = 12;

function secret() {
 const s = process.env.ADMIN_SESSION_SECRET || process.env.TICKET_SECRET;
 if (!s) throw new Error("Set ADMIN_SESSION_SECRET (or TICKET_SECRET) to use the admin area.");
 return s;
}

const sign = (value: string) => createHmac("sha256", secret()).update(`admin:${value}`).digest("base64url");

function same(a: string, b: string) {
 const x = Buffer.from(a), y = Buffer.from(b);
 return x.length === y.length && timingSafeEqual(x, y);
}

export function adminConfigured() {
 return !!process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 10;
}

export function passwordMatches(attempt: string) {
 const real = process.env.ADMIN_PASSWORD;
 if (!real || real.length < 10) return false;
 // Compare digests so the comparison takes the same time whatever the length.
 return same(sign(`pw:${attempt}`), sign(`pw:${real}`));
}

export async function startAdminSession() {
 const expires = String(Date.now() + HOURS * 3600_000);
 (await cookies()).set(COOKIE, `${expires}.${sign(expires)}`, {
  httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: HOURS * 3600,
 });
}

export async function endAdminSession() {
 (await cookies()).delete(COOKIE);
}

export async function isAdmin() {
 const value = (await cookies()).get(COOKIE)?.value ?? "";
 const [expires, mac] = value.split(".");
 if (!expires || !mac || Number(expires) < Date.now()) return false;
 try { return same(mac, sign(expires)); } catch { return false; }
}

/** Use at the top of every admin page and admin server action. */
export async function requireAdmin() {
 if (!(await isAdmin())) redirect("/admin/login");
}
