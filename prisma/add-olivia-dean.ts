import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
// Photo from https://tixel.com/au/music-tickets/2026/10/09/olivia-dean-qudos-bank-arena-syd
const imageUrl = "https://event-images.tixel.com/media/images/5380713db5eae2f44c5b7b8a766ecb00_1756094771_985_l.jpg";

async function main() {
  // Keep the USD base compatible with older deployments while the fixed-AUD update rolls out.
  const response = await fetch("https://api.frankfurter.dev/v2/rate/USD/AUD", { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Exchange rate unavailable");
  const rate = await response.json();
  if (rate.base !== "USD" || rate.quote !== "AUD" || !Number.isFinite(rate.rate) || rate.rate <= 0) throw new Error("Invalid exchange rate");
  const baseUsdCents = Math.round(15000 / rate.rate);
  // Dates/start times/address verified against https://afterpayarena.com.au/event/olivia-dean
  // Publish the listings without inventing sellable inventory. Add confirmed stock in admin.
  for (const day of ["09", "10"]) {
    const slug = `olivia-dean-sydney-2026-10-${day}`;
    const event = await prisma.event.upsert({
      where: { slug },
      update: { imageUrl, ticketTypes: { updateMany: { where: {}, data: { priceAudCents: 15000, priceCents: baseUsdCents } } } },
      create: {
        slug,
        imageUrl,
        title: "Olivia Dean — The Art of Loving Live",
        description: "Olivia Dean brings The Art of Loving Live to Afterpay Arena in Sydney Olympic Park. Show starts at 7:30 PM, with external doors opening at 6:30 PM. Prices on this site are charged in AUD. Ticket availability will be shown when inventory is confirmed.",
        category: "CONCERT",
        startsAt: new Date(`2026-10-${day}T19:30:00+11:00`),
        venue: { name: "Afterpay Arena (formerly Qudos Bank Arena)", address: "19 Edwin Flack Avenue, Sydney Olympic Park NSW 2127", city: "Sydney Olympic Park", country: "Australia", state: "NSW", postalCode: "2127", timezone: "Australia/Sydney" },
        performers: [{ name: "Olivia Dean", genre: "Soul / Pop" }],
        ageRestriction: "Guests aged 15 and under must be accompanied by an adult.",
        externalUrl: "https://afterpayarena.com.au/event/olivia-dean",
        published: true,
        ticketTypes: { create: { name: "Ticket", priceCents: baseUsdCents, priceAudCents: 15000, capacity: 0, available: 0, unlimited: false, maxPerOrder: 4 } },
      },
      include: { ticketTypes: true },
    });
    console.log(JSON.stringify({ slug: event.slug, startsAt: event.startsAt, published: event.published, tickets: event.ticketTypes.map(t => ({ name: t.name, baseUsdCents: t.priceCents, priceAudCents: t.priceAudCents, available: t.available })) }));
  }
}

main().catch(() => { console.error("Could not add Olivia Dean listings. Check database connectivity."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
