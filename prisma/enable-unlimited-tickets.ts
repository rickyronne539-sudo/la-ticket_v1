import { PrismaClient } from "@prisma/client";
import { TICKET_PRICE_CENTS } from "../src/lib/pricing";

const prisma = new PrismaClient();

async function main() {
  // Explicit bounds prevent accidentally enabling the entire catalog.
  const from = process.argv.find(arg => arg.startsWith("--from="))?.slice(7);
  const to = process.argv.find(arg => arg.startsWith("--to="))?.slice(5);
  if (!from || !to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to)) {
    throw new Error("Pass valid --from and --to timestamps (end exclusive).");
  }
  const where = { published: true, NOT: { OR: [{ slug: { startsWith: "olivia-dean-sydney-" } }, { slug: "nairobi-test-concert" }] }, startsAt: { gte: new Date(from), lt: new Date(to) } };
  const events = await prisma.event.findMany({ where, select: { id: true } });
  const types = await prisma.ticketType.findMany({ select: { eventId: true } });
  const withTickets = new Set(types.map(type => type.eventId));
  console.log(`${events.length} published events from ${from} to ${to} (end exclusive).`);
  if (process.argv.includes("--dry-run")) return;
  let created = 0;
  for (let offset = 0; offset < events.length; offset += 100) {
    const batch = events.slice(offset, offset + 100);
    await prisma.ticketType.updateMany({
      where: { eventId: { in: batch.map(event => event.id) } },
      data: { unlimited: true, priceCents: TICKET_PRICE_CENTS },
    });
    const missing = batch.filter(event => !withTickets.has(event.id));
    if (missing.length) {
      await prisma.ticketType.createMany({ data: missing.map(event => ({
        id: event.id, eventId: event.id, name: "General Admission", unlimited: true,
        priceCents: TICKET_PRICE_CENTS, capacity: 0, available: 0, maxPerOrder: 8,
      })) });
      created += missing.length;
    }
    console.log(`Updated ${Math.min(offset + 100, events.length)} of ${events.length} events.`);
  }
  const enabled = await prisma.ticketType.findMany({ where: { unlimited: true, priceCents: TICKET_PRICE_CENTS }, select: { eventId: true } });
  const enabledEvents = new Set(enabled.map(type => type.eventId));
  const missing = events.filter(event => !enabledEvents.has(event.id)).length;
  if (missing) throw new Error(`${missing} upcoming events still need unlimited tickets.`);
  console.log(`Verified ${events.length} events in the selected date range with unlimited $200 USD tickets; added ${created} General Admission types.`);
}

main().catch(() => {
  console.error("Could not enable unlimited tickets. Check database connectivity and rerun this script.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
