// The one event sold on this site: a test event with the $0.50 Test ticket (DEMO_TICKET),
// for trying a real payment end to end. Real shows come from Ticketmaster (`npm run tm:sync`)
// and link out to Ticketmaster for tickets.
//
// Running this updates events and prices in place. Orders and issued tickets are kept.
import { PrismaClient, type Category } from "@prisma/client";
import { NAIROBI_TEST_SLUG } from "../src/lib/pricing";
import { DEMO_TICKET } from "../src/lib/format";

const prisma = new PrismaClient();

type SeedTicket = { name: string; priceCents: number; capacity: number; maxPerOrder?: number };
type SeedEvent = {
  slug: string;
  title: string;
  description: string;
  category: Category;
  venue: { name: string; address: string; city: string; timezone: string };
  startsAt: string; // venue local time
  published?: boolean;
  ticketTypes: SeedTicket[];
};

const events: SeedEvent[] = [
  {
    slug: "test-event",
    title: "Test event",
    description: "Not a real show. Buy the $0.50 Test ticket to check that payments and ticket delivery work.",
    category: "CONCERT",
    venue: { name: "Online", address: "No venue", city: "Test", timezone: "America/Los_Angeles" },
    // Kept in the future so it stays listed.
    startsAt: "2027-12-31T20:00:00-08:00",
    ticketTypes: [],
  },
];

/**
 * Makes an event's ticket types match the seed. Tickets already sold stay counted:
 * `available` is the new capacity minus what was sold. A tier that is no longer listed is
 * deleted if nothing references it, otherwise it is closed (available 0).
 */
async function syncTicketTypes(eventId: string, wanted: SeedTicket[]) {
  const existing = await prisma.ticketType.findMany({ where: { eventId } });
  const pending = await prisma.order.findMany({ where: { eventId, status: "PENDING" }, select: { items: true } });
  const held = new Set(pending.flatMap((o) => o.items.map((i) => i.ticketTypeId)));

  for (const t of wanted) {
    const current = existing.find((e) => e.name === t.name);
    if (!current) {
      await prisma.ticketType.create({ data: { ...t, eventId, available: t.capacity } });
      continue;
    }
    const sold = current.capacity - current.available;
    await prisma.ticketType.update({
      where: { id: current.id },
      data: {
        priceCents: t.priceCents,
        capacity: t.capacity,
        maxPerOrder: t.maxPerOrder ?? 8,
        available: Math.max(0, t.capacity - sold),
      },
    });
  }

  for (const old of existing.filter((e) => !wanted.some((t) => t.name === e.name))) {
    const issued = await prisma.ticket.count({ where: { ticketTypeId: old.id } });
    if (issued === 0 && !held.has(old.id)) await prisma.ticketType.delete({ where: { id: old.id } });
    else await prisma.ticketType.update({ where: { id: old.id }, data: { available: 0 } });
  }
}

async function main() {
  for (const { ticketTypes, venue, startsAt, published = true, ...event } of events) {
    const data = { ...event, venue, published, startsAt: new Date(startsAt) };
    const saved = await prisma.event.upsert({ where: { slug: event.slug }, update: data, create: data });
    await syncTicketTypes(saved.id, [...ticketTypes, DEMO_TICKET]);
  }
  // Everything else except Ticketmaster imports (e.g. the old demo events) is taken off the site.
  const hidden = await prisma.event.updateMany({
    where: { slug: { notIn: [...events.map((e) => e.slug), NAIROBI_TEST_SLUG] }, NOT: { slug: { startsWith: "tm-" } } },
    data: { published: false },
  });
  console.log(`Seeded ${events.length} events, unpublished ${hidden.count}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
