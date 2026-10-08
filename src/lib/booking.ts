import { convertCents, ticketPriceCents } from "@/lib/pricing";
import "server-only";
import { verifyPriceQuote } from "./exchange-rates";
import { createHmac, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { StayError, priceStay, returnRooms, stayNights, stayTotal, takeRooms, type StayRequest } from "./hotels";

// Stripe Checkout sessions must stay open at least 30 minutes, so the hold matches that.
export const HOLD_MINUTES = 30;

export class BookingError extends Error {}

export type RequestedItem = { ticketTypeId: string; quantity: number };

/**
 * Atomically takes `quantity` tickets from inventory. MongoDB applies a single-document
 * update atomically, so two buyers racing for the last ticket can't both succeed:
 * the filter `available >= quantity` only matches for one of them.
 */
async function takeInventory(ticketTypeId: string, quantity: number) {
  const type = await prisma.ticketType.findUnique({ where: { id: ticketTypeId }, select: { unlimited: true } });
  if (!type) return false;
  if (type.unlimited) return true;
  const res = await prisma.ticketType.updateMany({
    where: { id: ticketTypeId, available: { gte: quantity } },
    data: { available: { decrement: quantity } },
  });
  return res.count === 1;
}

async function returnInventory(items: RequestedItem[]) {
  for (const item of items) {
    const type = await prisma.ticketType.findUnique({ where: { id: item.ticketTypeId }, select: { unlimited: true } });
    if (!type || type.unlimited) continue;
    await prisma.ticketType.updateMany({
      where: { id: item.ticketTypeId },
      data: { available: { increment: item.quantity } },
    });
  }
}

/**
 * Takes every item or none: if one ticket type is sold out, the ones already taken are
 * given back. This avoids needing a multi-document transaction.
 */
async function takeAll(items: RequestedItem[], names: Map<string, string>) {
  const taken: RequestedItem[] = [];
  for (const item of items) {
    if (!(await takeInventory(item.ticketTypeId, item.quantity))) {
      await returnInventory(taken);
      throw new BookingError(
        `Not enough "${names.get(item.ticketTypeId) ?? "tickets"}" left.`,
      );
    }
    taken.push(item);
  }
}

type HeldStay = { roomTypeId: string; checkIn: string; checkOut: string; rooms: number };

/** Gives back an order's hotel nights (if it has a stay). */
async function returnStay(stay: HeldStay | null | undefined) {
  if (stay) await returnRooms(stay.roomTypeId, stayNights(stay.checkIn, stay.checkOut), stay.rooms);
}

/** Takes an order's hotel nights again, e.g. when payment lands after the hold expired. */
async function retakeStay(stay: HeldStay | null | undefined) {
  if (!stay) return;
  try {
    await takeRooms(stay.roomTypeId, stayNights(stay.checkIn, stay.checkOut), stay.rooms);
  } catch (err) {
    if (err instanceof StayError) throw new BookingError(err.message);
    throw err;
  }
}

/**
 * Reserves tickets (and, for a package, hotel rooms for every night of the stay)
 * and creates a PENDING order that expires after HOLD_MINUTES. All or nothing:
 * if the rooms can't be had, the tickets go back on sale, and vice versa.
 */
export async function createHold(input: {
  eventId: string;
  email: string;
  userId: string;
  items: RequestedItem[];
  stay?: StayRequest | null;
  priceQuote?: string;
}) {
  const items = input.items.filter((i) => i.quantity > 0);
  if (items.length === 0) throw new BookingError("Pick at least one ticket.");

  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    include: { ticketTypes: true },
  });
  if (!event || !event.published) throw new BookingError("Event not found.");
  if (event.startsAt < new Date()) throw new BookingError("This event has already started.");

  let pricing;
  try { pricing = verifyPriceQuote(input.priceQuote, event); }
  catch (err) { throw new BookingError(err instanceof Error ? err.message : "Please refresh your price quote."); }

  const types = new Map(event.ticketTypes.map((t) => [t.id, t]));
  for (const item of items) {
    const type = types.get(item.ticketTypeId);
    if (!type) throw new BookingError("Invalid ticket type.");
    if (item.quantity > type.maxPerOrder) {
      throw new BookingError(`Max ${type.maxPerOrder} "${type.name}" tickets per order.`);
    }
  }

  // Check the stay before taking anything, so a bad date never touches inventory.
  let priced: Awaited<ReturnType<typeof priceStay>> | null = null;
  if (input.stay) {
    try {
      priced = await priceStay(input.stay, event);
      priced.stay.nightlyCents = convertCents(priced.stay.nightlyCents, pricing.exchangeRate);
    } catch (err) {
      if (err instanceof StayError) throw new BookingError(err.message);
      throw err;
    }
  }

  const orderItems = items.map((i) => {
    const type = types.get(i.ticketTypeId)!;
    return { ticketTypeId: type.id, name: type.name, quantity: i.quantity, priceCents: convertCents(ticketPriceCents(type.priceCents), pricing.exchangeRate) };
  });

  const names = new Map(event.ticketTypes.map((t) => [t.id, t.name]));
  await takeAll(items, names);
  if (priced) {
    try {
      await takeRooms(priced.stay.roomTypeId, priced.nights, priced.stay.rooms);
    } catch (err) {
      await returnInventory(items);
      if (err instanceof StayError) throw new BookingError(err.message);
      throw err;
    }
  }

  try {
    return await prisma.order.create({
      data: {
        eventId: event.id,
        currency: pricing.currency,
        exchangeRate: pricing.exchangeRate,
        email: input.email,
        userId: input.userId,
        items: orderItems,
        ...(priced && { hotelStay: priced.stay }),
        totalCents: orderItems.reduce((sum, i) => sum + i.priceCents * i.quantity, 0) + (priced ? stayTotal(priced.stay) : 0),
        accessToken: randomBytes(24).toString("base64url"),
        expiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000),
      },
      include: { event: true },
    });
  } catch (err) {
    await returnInventory(items);
    await returnStay(priced?.stay);
    throw err;
  }
}

/** Expires a PENDING order and puts its tickets back on sale. Safe to call repeatedly. */
export async function releaseOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  // Only the caller that flips PENDING -> EXPIRED returns the inventory.
  const res = await prisma.order.updateMany({
    where: { id: orderId, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
  if (res.count === 1) {
    await returnInventory(order.items);
    await returnStay(order.hotelStay);
  }
}

// Deterministic per order + position, so a retried webhook hits the unique
// constraint instead of issuing duplicate tickets.
function ticketCode(orderId: string, index: number) {
  const secret = process.env.TICKET_SECRET;
  if (!secret) throw new Error("TICKET_SECRET is not set");
  return createHmac("sha256", secret).update(`${orderId}:${index}`).digest("base64url").slice(0, 20);
}

async function issueTickets(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  let index = 0;
  for (const item of order.items) {
    for (let n = 0; n < item.quantity; n++) {
      try {
        await prisma.ticket.create({
          data: { orderId, ticketTypeId: item.ticketTypeId, code: ticketCode(orderId, index++) },
        });
      } catch (err) {
        const duplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!duplicate) throw err;
      }
    }
  }
}

export type ConfirmResult = "confirmed" | "already_paid" | "sold_out" | "not_found";

/**
 * Marks an order PAID and issues its tickets. Idempotent: payment webhooks may be
 * delivered more than once. If the hold expired before payment arrived, it tries to
 * reserve again; "sold_out" means the caller must refund.
 */
export async function confirmOrder(orderId: string, stripeSessionId?: string): Promise<ConfirmResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return "not_found";

  const markPaid = (from: "PENDING" | "EXPIRED") =>
    prisma.order.updateMany({
      where: { id: orderId, status: from },
      data: { status: "PAID", paidAt: new Date(), ...(stripeSessionId && { stripeSessionId }) },
    });

  if (order.status === "PENDING" && (await markPaid("PENDING")).count === 1) {
    await issueTickets(orderId);
    return "confirmed";
  }

  const current = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (current.status === "PAID") {
    await issueTickets(orderId); // finishes a previous attempt that crashed midway
    return "already_paid";
  }

  if (current.status === "EXPIRED") {
    try {
      await takeAll(current.items, new Map(current.items.map((i) => [i.ticketTypeId, i.name])));
    } catch (err) {
      if (err instanceof BookingError) return "sold_out";
      throw err;
    }
    try {
      await retakeStay(current.hotelStay);
    } catch (err) {
      await returnInventory(current.items);
      if (err instanceof BookingError) return "sold_out";
      throw err;
    }
    if ((await markPaid("EXPIRED")).count === 1) {
      await issueTickets(orderId);
      return "confirmed";
    }
    await returnInventory(current.items); // another request confirmed it first
    await returnStay(current.hotelStay);
    return "already_paid";
  }

  return "sold_out"; // REFUNDED
}
