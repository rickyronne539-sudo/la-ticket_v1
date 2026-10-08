import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const slug = "olivia-dean-sydney-2026-10-09";

async function main() {
  const event = await prisma.event.findUnique({
    where: { slug },
    include: { ticketTypes: true },
  });

  if (!event) throw new Error(`Event not found: ${slug}`);
  if (!event.published) throw new Error(`Event is not published: ${slug}`);
  if (event.startsAt <= new Date()) throw new Error(`Event has already started: ${slug}`);
  if (event.ticketTypes.length === 0) throw new Error(`No ticket types configured for: ${slug}`);

  await prisma.ticketType.updateMany({
    where: { eventId: event.id },
    data: { unlimited: true },
  });
  await prisma.event.update({
    where: { id: event.id },
    data: {
      description: "Olivia Dean brings The Art of Loving Live to Afterpay Arena in Sydney Olympic Park. Show starts at 7:30 PM, with external doors opening at 6:30 PM. Prices on this site are charged in AUD. Tickets are available to book directly with LA Tickets.",
    },
  });

  const ticketTypes = await prisma.ticketType.findMany({
    where: { eventId: event.id },
    select: { name: true, unlimited: true, available: true, priceAudCents: true },
  });
  if (ticketTypes.some((ticket) => !ticket.unlimited)) {
    throw new Error(`Could not enable unlimited availability for: ${slug}`);
  }

  console.log(JSON.stringify({ slug, ticketTypes }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Could not enable unlimited ticket availability.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
