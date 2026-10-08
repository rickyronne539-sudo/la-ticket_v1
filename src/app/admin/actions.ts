"use server";

import { ticketPriceCents } from "@/lib/pricing";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { endAdminSession, passwordMatches, requireAdmin, startAdminSession } from "@/lib/admin";
import { addDays, isIsoDate, MAX_NIGHTS } from "@/lib/hotels";

export type FormState = { error?: string; ok?: string };
const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const dollars = z.coerce.number().min(0).max(100000).transform((n) => Math.round(n * 100));
const first = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form and try again.";

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
 const ok = passwordMatches(String(formData.get("password") ?? ""));
 if (!ok) {
  await new Promise((r) => setTimeout(r, 600)); // slow down guessing
  return { error: "That password isn't right." };
 }
 await startAdminSession();
 redirect("/admin");
}

export async function logout() {
 await endAdminSession();
 redirect("/admin/login");
}

// ---------- Your ticket inventory on an event ----------

const ticketTypeSchema = z.object({
 eventId: objectId,
 name: z.string().trim().min(1, "Name the ticket type.").max(80),
 price: dollars,
 capacity: z.coerce.number().int().min(1, "Add at least 1 ticket.").max(100000),
 maxPerOrder: z.coerce.number().int().min(1).max(20),
});

export async function addTicketType(_prev: FormState, formData: FormData): Promise<FormState> {
 await requireAdmin();
 const parsed = ticketTypeSchema.safeParse(Object.fromEntries(formData));
 if (!parsed.success) return { error: first(parsed.error) };
 const { eventId, name, price, capacity, maxPerOrder } = parsed.data;
 const event = await prisma.event.findUnique({ where: { id: eventId }, select: { slug: true } });
 if (!event) return { error: "Event not found." };
 await prisma.ticketType.create({ data: { eventId, name, priceCents: ticketPriceCents(price), capacity, available: capacity, maxPerOrder } });
 revalidatePath(`/admin/events/${eventId}`);
 revalidatePath(`/events/${event.slug}`);
 return { ok: `${name} added: ${capacity} tickets on sale.` };
}

/** Adds (or with a negative number, withdraws) unsold tickets. Never takes back sold or held ones. */
export async function adjustTickets(formData: FormData) {
 await requireAdmin();
 const id = objectId.parse(formData.get("ticketTypeId"));
 const change = z.coerce.number().int().min(-100000).max(100000).parse(formData.get("change"));
 const type = await prisma.ticketType.findUniqueOrThrow({ where: { id }, include: { event: { select: { slug: true } } } });
 const price = ticketPriceCents(dollars.parse(formData.get("price")));
 if (!type.unlimited && change < 0) {
  await prisma.ticketType.updateMany({ where: { id, available: { gte: -change } }, data: { available: { increment: change }, capacity: { increment: change } } });
 } else if (!type.unlimited && change > 0) {
  await prisma.ticketType.update({ where: { id }, data: { available: { increment: change }, capacity: { increment: change } } });
 }
 if (price !== undefined && price !== type.priceCents) await prisma.ticketType.update({ where: { id }, data: { priceCents: price } });
 revalidatePath(`/admin/events/${type.eventId}`);
}

// ---------- Hotels ----------

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const hotelSchema = z.object({
 name: z.string().trim().min(2, "Enter the hotel name.").max(120),
 address: z.string().trim().min(3, "Enter the street address.").max(200),
 city: z.string().trim().min(2, "Enter the city, spelled as in the event listings.").max(80),
 description: z.string().trim().max(1000).default(""),
 imageUrl: z.union([z.literal(""), z.url("Image must be a full https:// address.").startsWith("https://", "Image must use https://")]).default(""),
 stars: z.union([z.literal(""), z.coerce.number().int().min(1).max(5)]).default(""),
});

export async function createHotel(_prev: FormState, formData: FormData): Promise<FormState> {
 await requireAdmin();
 const parsed = hotelSchema.safeParse(Object.fromEntries(formData));
 if (!parsed.success) return { error: first(parsed.error) };
 const d = parsed.data;
 let slug = slugify(`${d.name}-${d.city}`) || "hotel";
 if (await prisma.hotel.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
 const hotel = await prisma.hotel.create({
  data: { slug, name: d.name, address: d.address, city: d.city, description: d.description, imageUrl: d.imageUrl || null, stars: d.stars === "" ? null : d.stars, published: false },
 });
 redirect(`/admin/hotels/${hotel.id}`);
}

export async function updateHotel(_prev: FormState, formData: FormData): Promise<FormState> {
 await requireAdmin();
 const id = objectId.safeParse(formData.get("hotelId"));
 const parsed = hotelSchema.safeParse(Object.fromEntries(formData));
 if (!id.success || !parsed.success) return { error: parsed.success ? "Hotel not found." : first(parsed.error) };
 const d = parsed.data;
 await prisma.hotel.update({
  where: { id: id.data },
  data: { name: d.name, address: d.address, city: d.city, description: d.description, imageUrl: d.imageUrl || null, stars: d.stars === "" ? null : d.stars, published: formData.get("published") === "on" },
 });
 revalidatePath(`/admin/hotels/${id.data}`);
 revalidatePath("/travel");
 return { ok: "Saved." };
}

const roomSchema = z.object({
 hotelId: objectId,
 name: z.string().trim().min(2, "Name the room type.").max(80),
 sleeps: z.coerce.number().int().min(1).max(12),
 price: dollars.refine((c) => c >= 100, "Nightly price must be at least $1."),
 maxRooms: z.coerce.number().int().min(1).max(10),
});

export async function addRoomType(_prev: FormState, formData: FormData): Promise<FormState> {
 await requireAdmin();
 const parsed = roomSchema.safeParse(Object.fromEntries(formData));
 if (!parsed.success) return { error: first(parsed.error) };
 const { hotelId, name, sleeps, price, maxRooms } = parsed.data;
 await prisma.roomType.create({ data: { hotelId, name, sleeps, nightlyCents: price, maxRooms } });
 revalidatePath(`/admin/hotels/${hotelId}`);
 return { ok: `${name} added. Now set how many rooms you have each night.` };
}

export async function updateRoomPrice(formData: FormData) {
 await requireAdmin();
 const id = objectId.parse(formData.get("roomTypeId"));
 const price = dollars.parse(formData.get("price"));
 if (price < 100) return;
 const room = await prisma.roomType.update({ where: { id }, data: { nightlyCents: price } });
 revalidatePath(`/admin/hotels/${room.hotelId}`);
}

const availabilitySchema = z.object({
 roomTypeId: objectId,
 from: z.string().refine(isIsoDate, "Choose the first night."),
 to: z.string().refine(isIsoDate, "Choose the last night."),
 rooms: z.coerce.number().int().min(0).max(500),
});

/**
 * Sets how many rooms are still for sale on each night in a range. This is the
 * number left to sell, so rooms already sold or held are not counted again.
 */
export async function setAvailability(_prev: FormState, formData: FormData): Promise<FormState> {
 await requireAdmin();
 const parsed = availabilitySchema.safeParse(Object.fromEntries(formData));
 if (!parsed.success) return { error: first(parsed.error) };
 const { roomTypeId, from, to, rooms } = parsed.data;
 if (to < from) return { error: "The last night must be on or after the first." };
 const dates: string[] = [];
 for (let d = from; d <= to; d = addDays(d, 1)) {
  dates.push(d);
  if (dates.length > 366) return { error: "Set at most one year at a time." };
 }
 const room = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
 if (!room) return { error: "Room type not found." };
 for (const date of dates) {
  await prisma.roomNight.upsert({ where: { roomTypeId_date: { roomTypeId, date } }, create: { roomTypeId, date, available: rooms }, update: { available: rooms } });
 }
 revalidatePath(`/admin/hotels/${room.hotelId}`);
 return { ok: `${room.name}: ${rooms} room${rooms === 1 ? "" : "s"} for sale on ${dates.length} night${dates.length === 1 ? "" : "s"} (${from} to ${to}). Stays can be up to ${MAX_NIGHTS} nights.` };
}
