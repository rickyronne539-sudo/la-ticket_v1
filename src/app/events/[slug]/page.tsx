import { convertCents, ticketPriceCents } from "@/lib/pricing";
import Link from "next/link";
import { createPriceQuote } from "@/lib/exchange-rates";
import { currentCustomer } from "@/lib/customer";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { categoryLabels, formatDate, formatPrice } from "@/lib/format";
import { livePaymentsConfigured } from "@/lib/stripe";
import { TicketPicker } from "@/components/ticket-picker";
import { Performers, VenueInfo } from "@/components/event-details";
import { hotelsForEvent } from "@/lib/hotels";

async function getEvent(slug: string) {
  return prisma.event.findUnique({
    where: { slug },
    include: { ticketTypes: { orderBy: { priceCents: "asc" } } },
  });
}

export async function generateMetadata(props: PageProps<"/events/[slug]">): Promise<Metadata> {
  const event = await getEvent((await props.params).slug);
  return { title: event?.title ?? "Event not found" };
}

export default async function EventPage(props: PageProps<"/events/[slug]">) {
  await connection(); // always render with live inventory
  const { slug } = await props.params;
  const { cancelled } = await props.searchParams;
  const event = await getEvent(slug);
  // Past events aren't shown anywhere, including by direct link. (Orders keep their own page.)
  if (!event || !event.published || event.startsAt < new Date()) notFound();
  // Sold here only when you've added your own ticket inventory.
  const user = await currentCustomer();
  const sellsHere = event.ticketTypes.length > 0;
  const quote = sellsHere ? await createPriceQuote(event).catch(() => null) : null;
  const fromPrice = quote && sellsHere ? Math.min(...event.ticketTypes.map(t => convertCents(ticketPriceCents(t.priceCents), quote.exchangeRate))) : null;
  const stayOptions = sellsHere ? await hotelsForEvent(event).catch(() => null) : null;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      <article className="space-y-4">
        <span className="text-xs font-medium uppercase tracking-wide opacity-60">
          {categoryLabels[event.category]}
        </span>
        <h1 className="text-3xl font-bold tracking-tight">{event.title}</h1>
        <div className="space-y-1 text-sm opacity-80">
          <p>{formatDate(event.startsAt, event.venue.timezone)}</p>
          <p>
            {event.venue.name} · {event.venue.address}, {event.venue.city}
          </p>
        </div>
        {/* Imported descriptions end with where Ticketmaster sells them. Only say "book here" when you actually sell this event. */}
        <p className="leading-relaxed">{event.description.replace(/\s*Tickets (?:and current availability are on|are sold on) Ticketmaster\./g, sellsHere ? " Book tickets directly with LA Tickets." : "")}</p>
        <Performers performers={event.performers} />
        <VenueInfo venue={event.venue} seatmapUrl={event.seatmapUrl} ageRestriction={event.ageRestriction} />
      </article>

      <aside className="h-fit rounded-xl border border-black/10 p-5 dark:border-white/10">
        <h2 className="mb-4 text-lg font-semibold">{stayOptions?.hotels.length ? "Tickets + Hotel" : "Tickets"}</h2>
        {cancelled && (
          <p className="mb-4 rounded-md bg-amber-500/10 px-3 py-2 text-sm">
            Checkout cancelled. Your tickets (and any rooms) were released.
          </p>
        )}
        {!sellsHere ? (
          <div className="space-y-3" role="status">
            <p className="font-semibold">Tickets not available yet</p>
            <p className="text-sm opacity-80">Booking will open once ticket inventory is available.</p>
            <button type="button" disabled className="ticket-button w-full opacity-50">Booking unavailable</button>
          </div>
        ) : !quote ? (
          <p role="alert">Prices are temporarily unavailable. Please refresh this page before booking.</p>
        ) : !event.ticketTypes.some(t => t.unlimited || t.available > 0) ? (
          <div className="space-y-3" role="status">
            <p className="text-xl font-semibold">From {formatPrice(fromPrice!, quote.currency)} per ticket</p>
            <p>Booking is unavailable until ticket inventory is confirmed.</p>
            <button type="button" disabled className="ticket-button w-full opacity-50">Booking unavailable</button>
          </div>
        ) : !livePaymentsConfigured ? (
          <p role="alert">Live payments are temporarily unavailable. Please try again later.</p>
        ) : !user ? (
          <div className="space-y-4"><p className="text-xl font-semibold">From {formatPrice(fromPrice!, quote.currency)} per ticket</p><p>Create an account or sign in to book. We’ll email your payment receipt to your account email.</p><Link className="ticket-button" href={`/account/login?next=${encodeURIComponent(`/events/${slug}`)}`}>Create account / Sign in</Link></div>
        ) : (
          <TicketPicker
            currency={quote.currency}
            priceQuote={quote.token}
            accountEmail={user.email}
            eventId={event.id}
            eventDay={stayOptions?.eventDay ?? null}
            hotels={(stayOptions?.hotels ?? []).map(h => ({ ...h, rooms: h.rooms.map(r => ({ ...r, nightlyCents: convertCents(r.nightlyCents, quote.exchangeRate) })) }))}
            ticketTypes={event.ticketTypes.map((t) => ({
              id: t.id,
              name: t.name,
              priceCents: convertCents(ticketPriceCents(t.priceCents), quote.exchangeRate),
              available: t.available,
              unlimited: t.unlimited,
              maxPerOrder: t.maxPerOrder,
            }))}
          />
        )}
      </aside>
    </div>
  );
}
