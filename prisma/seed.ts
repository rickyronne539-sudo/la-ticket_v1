// Retire known test listings; preserve orders and issued tickets.
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
const prisma = new PrismaClient();
async function main() {
  const events = await prisma.event.findMany({ where: { slug: { in: ["test-event", "nairobi-test-concert"] } }, select: { id: true } });
  const ids = events.map(e => e.id);
  await prisma.event.updateMany({ where: { id: { in: ids } }, data: { published: false } });
  await prisma.ticketType.updateMany({ where: { eventId: { in: ids } }, data: { unlimited: false, available: 0 } });
  const pending = await prisma.order.findMany({ where: { eventId: { in: ids }, status: "PENDING" }, select: { id: true, stripeSessionId: true } });
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const stripe = /^(sk|rk)_live_/.test(key) ? new Stripe(key) : null;
  let closed = 0;
  let retained = 0;
  for (const order of pending) {
    if (order.stripeSessionId) {
      if (!stripe) { retained++; continue; }
      // Never expire a paid or uncertain order. Leave it for normal reconciliation.
      try {
        let session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
        if (session.metadata?.orderId !== order.id) { retained++; continue; }
        if (session.status === "open") session = await stripe.checkout.sessions.expire(session.id);
        if (session.status !== "expired") { retained++; continue; }
      } catch { retained++; continue; }
    }
    const result = await prisma.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    closed += result.count;
  }
  console.log(JSON.stringify({ retiredTestEvents: events.length, closedUnpaidTestOrders: closed, retainedForPaymentReconciliation: retained }));
}
main().catch(() => { console.error("Could not finish retiring test listings. Check database/Stripe connectivity and rerun."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
