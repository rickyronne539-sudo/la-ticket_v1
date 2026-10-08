import { PrismaClient } from "@prisma/client";
import { NAIROBI_TEST_SLUG, ticketPriceCents } from "../src/lib/pricing";

const prisma = new PrismaClient();

async function main() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!/^(sk|rk)_live_/.test(key) || !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_")) {
    throw new Error("Live Stripe secret and publishable keys are required for this payment test.");
  }
  const event = await prisma.event.upsert({
    where: { slug: NAIROBI_TEST_SLUG },
    update: {},
    create: {
      slug: NAIROBI_TEST_SLUG,
      title: "Nairobi Test Concert",
      description: "Payment test only — this is not a real concert. One test ticket costs USD 0.50 and charges real money through Stripe. No admission to a live show is included. The date is a placeholder for testing.",
      category: "CONCERT",
      venue: { name: "Payment test — no physical venue", address: "Nairobi, Kenya", city: "Nairobi", country: "Kenya", timezone: "Africa/Nairobi" },
      startsAt: new Date("2027-12-31T20:00:00+03:00"),
      published: true,
      ticketTypes: { create: { name: "Live payment test ticket", priceCents: ticketPriceCents(NAIROBI_TEST_SLUG), capacity: 0, available: 0, unlimited: true, maxPerOrder: 1 } },
    },
    include: { ticketTypes: true },
  });
  console.log(JSON.stringify({ slug: event.slug, published: event.published, tickets: event.ticketTypes.map(t => ({ name: t.name, priceCents: t.priceCents, maxPerOrder: t.maxPerOrder })) }));
}

main().catch(() => {
  console.error("Could not add Nairobi test concert. Check database connectivity and live Stripe configuration.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
