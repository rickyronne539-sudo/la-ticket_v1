import "server-only";
import { prisma } from "./db";

export class StayError extends Error {}

export const MAX_NIGHTS = 14;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar arithmetic on "YYYY-MM-DD" strings, done in UTC so time zones can't shift a day. */
export function addDays(date: string, days: number) {
 const d = new Date(`${date}T00:00:00Z`);
 d.setUTCDate(d.getUTCDate() + days);
 return d.toISOString().slice(0, 10);
}

export function isIsoDate(value: unknown): value is string {
 return typeof value === "string" && ISO_DATE.test(value) && addDays(value, 0) === value;
}

/** The nights a stay occupies: check-in up to, but not including, check-out. */
export function stayNights(checkIn: string, checkOut: string) {
 if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) throw new StayError("Choose check-in and check-out dates.");
 const nights: string[] = [];
 for (let d = checkIn; d < checkOut; d = addDays(d, 1)) {
  nights.push(d);
  if (nights.length > MAX_NIGHTS) throw new StayError(`Stays can be up to ${MAX_NIGHTS} nights.`);
 }
 if (!nights.length) throw new StayError("Check-out must be after check-in.");
 return nights;
}

/** The event's calendar date where it happens, which the stay must include. */
export function eventLocalDate(startsAt: Date, timeZone: string) {
 return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(startsAt);
}

export type StayRequest = { roomTypeId: string; checkIn: string; checkOut: string; rooms: number; guestName: string };

/**
 * Takes `rooms` on every night of the stay, or none: a night that is short gives
 * back the nights already taken. Each night is one document, updated atomically.
 */
export async function takeRooms(roomTypeId: string, nights: string[], rooms: number) {
 const taken: string[] = [];
 for (const date of nights) {
  const res = await prisma.roomNight.updateMany({
   where: { roomTypeId, date, available: { gte: rooms } },
   data: { available: { decrement: rooms } },
  });
  if (res.count !== 1) {
   await returnRooms(roomTypeId, taken, rooms);
   throw new StayError(`Not enough rooms left on ${new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}. Try other dates or another room.`);
  }
  taken.push(date);
 }
}

export async function returnRooms(roomTypeId: string, nights: string[], rooms: number) {
 for (const date of nights) {
  await prisma.roomNight.updateMany({ where: { roomTypeId, date }, data: { available: { increment: rooms } } });
 }
}

/**
 * Checks a requested stay against the event and the room type, without taking
 * anything. Returns what goes on the order.
 */
export async function priceStay(request: StayRequest, event: { startsAt: Date; venue: { city: string; timezone: string } }) {
 const nights = stayNights(request.checkIn, request.checkOut);
 const eventDay = eventLocalDate(event.startsAt, event.venue.timezone);
 if (!(request.checkIn <= eventDay && eventDay <= request.checkOut)) {
  throw new StayError("Your stay must include the night of the event (or check out that morning).");
 }
 const guestName = request.guestName.trim();
 if (guestName.length < 2 || guestName.length > 120) throw new StayError("Enter the name the room should be booked under.");
 const roomType = await prisma.roomType.findUnique({ where: { id: request.roomTypeId }, include: { hotel: true } });
 if (!roomType || !roomType.hotel.published) throw new StayError("That room is no longer available.");
 if (roomType.hotel.city.trim().toLowerCase() !== event.venue.city.trim().toLowerCase()) throw new StayError("That hotel isn't in the event's city.");
 if (!Number.isInteger(request.rooms) || request.rooms < 1 || request.rooms > roomType.maxRooms) {
  throw new StayError(`Choose between 1 and ${roomType.maxRooms} rooms.`);
 }
 return {
  nights,
  stay: {
   roomTypeId: roomType.id,
   hotelName: roomType.hotel.name,
   hotelAddress: `${roomType.hotel.address}, ${roomType.hotel.city}`,
   roomName: roomType.name,
   checkIn: request.checkIn,
   checkOut: request.checkOut,
   nights: nights.length,
   rooms: request.rooms,
   nightlyCents: roomType.nightlyCents,
   guestName,
  },
 };
}

export const stayTotal = (stay: { nights: number; rooms: number; nightlyCents: number }) => stay.nights * stay.rooms * stay.nightlyCents;

/** Hotels with rooms bookable around an event: same city, at least one night with rooms. */
export async function hotelsForEvent(event: { startsAt: Date; venue: { city: string; timezone: string } }) {
 const day = eventLocalDate(event.startsAt, event.venue.timezone);
 const window = [addDays(day, -3), addDays(day, 3)];
 const hotels = await prisma.hotel.findMany({
  where: { published: true, city: { equals: event.venue.city, mode: "insensitive" } },
  include: { roomTypes: { orderBy: { nightlyCents: "asc" }, include: { nights: { where: { date: { gte: window[0], lte: window[1] } }, orderBy: { date: "asc" } } } } },
  orderBy: { name: "asc" },
 });
 return {
  eventDay: day,
  hotels: hotels
   .map(h => ({
    id: h.id, name: h.name, address: h.address, stars: h.stars, imageUrl: h.imageUrl, description: h.description,
    rooms: h.roomTypes.map(r => ({
     id: r.id, name: r.name, sleeps: r.sleeps, nightlyCents: r.nightlyCents, maxRooms: r.maxRooms,
     // Rooms left per night in the window around the show, so the picker can grey out dates.
     availability: Object.fromEntries(r.nights.map(n => [n.date, n.available])),
    })).filter(r => Object.values(r.availability).some(a => a > 0)),
   }))
   .filter(h => h.rooms.length),
 };
}
