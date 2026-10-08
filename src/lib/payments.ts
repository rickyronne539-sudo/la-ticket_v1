import "server-only";
import type Stripe from "stripe";
import { confirmOrder, releaseOrder } from "./booking";
import { prisma } from "./db";
import { stripe } from "./stripe";

/**
 * Applies a Checkout Session's outcome to its order. Used by the webhook and by
 * syncOrderPayment, so either one can confirm a payment. Safe to call repeatedly.
 */
export async function settleCheckoutSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  if (!stripe || !orderId) return;

  if (session.status === "complete" && session.payment_status === "paid") {
    const result = await confirmOrder(orderId, session.id);
    if (result === "sold_out" && session.payment_intent) {
      // Hold expired and the tickets were sold to someone else meanwhile.
      // The idempotency key stops a second caller from refunding twice.
      await stripe.refunds.create(
        { payment_intent: String(session.payment_intent) },
        { idempotencyKey: `refund-order-${orderId}` },
      );
      await prisma.order.updateMany({ where: { id: orderId, status: { not: "PAID" } }, data: { status: "REFUNDED" } });
    }
  } else if (session.status === "expired") {
    await releaseOrder(orderId);
  }
}

/**
 * Asks Stripe whether an unpaid order's checkout was paid, and settles it if so.
 * The answer comes from Stripe with our secret key, never from the browser,
 * so payment works without the webhook.
 */
export async function syncOrderPayment(order: { id: string; status: string; stripeSessionId: string | null }) {
  if (!stripe || !order.stripeSessionId || order.status !== "PENDING") return null;
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
  } catch (err) {
    // e.g. the session was made with test keys and the site now uses live ones.
    if ((err as { code?: string }).code === "resource_missing") return "missing";
    console.error("Stripe session lookup failed", err instanceof Error ? err.name : "Unknown error");
    return null;
  }
  if (session.metadata?.orderId !== order.id) return "missing";
  await settleCheckoutSession(session);
  return session;
}

/**
 * Releases holds that ran out, but first asks Stripe about each one, so a buyer who
 * paid and closed the tab gets their tickets instead of losing the reservation.
 */
export async function expireStaleOrders() {
  const stale = await prisma.order.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    select: { id: true, status: true, stripeSessionId: true },
    take: 500,
  });
  for (const order of stale) {
    if (!order.stripeSessionId || !stripe) {
      await releaseOrder(order.id);
      continue;
    }
    const session = await syncOrderPayment(order);
    // Stripe unreachable: keep the hold rather than risk cancelling a paid order. Next run retries.
    if (!session) continue;
    if (session === "missing") {
      await releaseOrder(order.id);
    } else if (session.status === "open") {
      // Close the payment form first, so nobody can pay for seats we are giving back.
      const closed = await stripe.checkout.sessions.expire(session.id).catch(() => null);
      if (closed) await releaseOrder(order.id);
      else await syncOrderPayment(order); // it completed in the meantime
    }
  }
  return stale.length;
}

/** Checks a shopper's unpaid orders with Stripe, e.g. when they open their bookings. */
export async function syncPendingOrders(userId: string) {
  const pending = await prisma.order.findMany({
    where: { userId, status: "PENDING", stripeSessionId: { not: null } },
    select: { id: true, status: true, stripeSessionId: true },
    take: 10,
  });
  await Promise.all(pending.map(syncOrderPayment));
}
