"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { allowLogin, hashPassword, verifyPassword, startCustomerSession, endCustomerSession, safeNext } from "@/lib/customer";

export async function authenticate(_previous: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const parsed = z.object({ email: z.email().max(254), password: z.string().min(12).max(128), mode: z.enum(["register", "login"]) }).safeParse({ email: String(form.get("email") ?? "").trim().toLowerCase(), password: form.get("password"), mode: form.get("mode") });
  if (!parsed.success) return { error: "Enter a valid email and a password of 12–128 characters." };
  const { email, password, mode } = parsed.data;
  if (!(await allowLogin(email))) return { error: "Too many attempts. Please try again in 15 minutes." };
  let user = await prisma.customerAccount.findUnique({ where: { email } });
  if (mode === "register") {
    if (user) return { error: "Unable to create this account. Try signing in." };
    try { user = await prisma.customerAccount.create({ data: { email, passwordHash: await hashPassword(password) } }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "Unable to create this account. Try signing in." }; throw error; }
  } else {
    const valid = await verifyPassword(password, user?.passwordHash ?? `${"0".repeat(32)}:${"0".repeat(128)}`);
    if (!user || !valid) return { error: "Email or password is incorrect." };
  }
  await startCustomerSession(user!.id);
  redirect(safeNext(form.get("next")));
}
export async function signOut() { await endCustomerSession(); redirect("/account/login"); }
