import "server-only";
import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { prisma } from "./db";

const derive = promisify(scrypt);
const cookieName = "la_customer";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function safeNext(value: unknown) {
  return typeof value === "string" && /^\/(?:events\/|account(?:$|\?))/.test(value) && !/[\\\r\n]/.test(value) ? value : "/account";
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, 64) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const key = await derive(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}
export async function allowLogin(email: string) {
  const key = digest(`${email}:${Math.floor(Date.now() / 900000)}`);
  const attempt = await prisma.loginAttempt.upsert({ where: { key }, create: { key, count: 1, expiresAt: new Date(Date.now() + 900000) }, update: { count: { increment: 1 } } });
  return attempt.count <= 10;
}
export async function startCustomerSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await prisma.customerSession.create({ data: { userId, tokenHash: digest(token), expiresAt } });
  (await cookies()).set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
}
export async function currentCustomer() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const session = await prisma.customerSession.findUnique({ where: { tokenHash: digest(token) } });
  if (!session || session.expiresAt <= new Date()) return null;
  return prisma.customerAccount.findUnique({ where: { id: session.userId }, select: { id: true, email: true } });
}
export async function endCustomerSession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await prisma.customerSession.deleteMany({ where: { tokenHash: digest(token) } });
  jar.delete(cookieName);
}
