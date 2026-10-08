import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { TravelSearch } from "@/components/travel-search";
import { hotelSearchUrl, packageBadge } from "@/lib/travel";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
 title: "Travel: Tickets + Hotels",
 description: "Plan a trip around a live event: find tickets, then a hotel close to the venue.",
};

type Listing = { title: string; slug: string; imageUrl: string | null; city: string; venue: string; startsAt: Date; fromCents: number | null };

async function loadTravel() {
 const events = await prisma.event.findMany({
  // Events you sell always count; listings without a poster only if they have one to show.
  where: { published: true, startsAt: { gte: new Date() }, OR: [{ imageUrl: { not: null } }, { ticketTypes: { some: { available: { gt: 0 } } } }] },
  select: { title: true, slug: true, imageUrl: true, venue: true, startsAt: true, ticketTypes: { where: { available: { gt: 0 } }, select: { priceCents: true } } },
  orderBy: { startsAt: "asc" },
  take: 2000,
 });
 const listings: Listing[] = events.map(e => ({ title: e.title, slug: e.slug, imageUrl: e.imageUrl, city: e.venue.city, venue: e.venue.name, startsAt: e.startsAt, fromCents: e.ticketTypes.length ? Math.min(...e.ticketTypes.map(t => t.priceCents)) : null }));

 // Cheapest nightly price per city among published hotels with rooms left on some upcoming night.
 const today = new Date().toISOString().slice(0, 10);
 const rooms = await prisma.roomType.findMany({
  where: { hotel: { is: { published: true } }, nights: { some: { date: { gte: today }, available: { gt: 0 } } } },
  select: { nightlyCents: true, hotel: { select: { city: true } } },
 });
 const hotelFrom = new Map<string, number>();
 for (const r of rooms) {
  const city = r.hotel.city.trim().toLowerCase();
  hotelFrom.set(city, Math.min(hotelFrom.get(city) ?? Infinity, r.nightlyCents));
 }
 const hotelIn = (city: string) => hotelFrom.get(city.trim().toLowerCase()) ?? null;

 // Packages: one card per show, most dates first (the shows people travel for).
 const byTitle = new Map<string, Listing[]>();
 for (const l of listings) byTitle.set(l.title, [...(byTitle.get(l.title) ?? []), l]);
 const packages = [...byTitle.values()]
  // Shows you sell come first (with a hotel, then without), then the busiest listings.
  .map(dates => ({ dates, sold: dates.filter(d => d.fromCents !== null) }))
  .map(x => ({ ...x, rank: x.sold.some(d => hotelIn(d.city) !== null) ? 2 : x.sold.length ? 1 : 0 }))
  .sort((a, b) => b.rank - a.rank || b.dates.length - a.dates.length)
  .map(x => (x.sold.length ? x.sold : x.dates))
  // Touring and residency listings of one show often share a poster; show it once.
  .filter((dates, i, all) => all.findIndex(other => other[0].imageUrl === dates[0].imageUrl) === i)
  .slice(0, 9)
  .map(dates => {
   const first = dates[0];
   const cities = new Set(dates.map(d => d.city));
   const fromCents = dates.some(d => d.fromCents !== null) ? Math.min(...dates.filter(d => d.fromCents !== null).map(d => d.fromCents!)) : null;
   const hotelCents = fromCents === null ? null : dates.reduce<number | null>((n, d) => { const h = hotelIn(d.city); return h === null ? n : n === null ? h : Math.min(n, h); }, null);
   const sale: "package" | "tickets" | "external" = fromCents === null ? "external" : hotelCents !== null ? "package" : "tickets";
   return {
    ...first,
    dates: dates.length,
    where: cities.size > 1 ? "Multiple Cities" : first.city,
    badge: packageBadge(first.startsAt, dates.length, sale),
    sale, fromCents, hotelCents,
    href: dates.length > 1 ? `/?q=${encodeURIComponent(first.title)}#results` : `/events/${first.slug}`,
    hotelFor: cities.size > 1 ? null : `${first.venue}, ${first.city}`,
   };
  });

 // Destinations: the cities with the most going on, pictured by one of their shows.
 const byCity = new Map<string, Listing[]>();
 for (const l of listings) byCity.set(l.city, [...(byCity.get(l.city) ?? []), l]);
 const destinations = [...byCity.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 6)
  .map(([city, list]) => ({ city, count: list.length, venues: new Set(list.map(l => l.venue)).size, imageUrl: list.find(l => l.imageUrl)?.imageUrl ?? null, hotelCents: hotelIn(city) }));

 const cities = [...byCity.keys()].sort();
 return { packages, destinations, cities };
}

const Check = () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#22c55e"/><path d="m7 12.5 3.2 3.2L17.5 8.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;

export default async function TravelPage() {
 await connection();
 const data = await loadTravel().catch(() => null);
 return <div className="travel-page">
  <section className="travel-hero">
   <div className="travel-hero-art" aria-hidden="true">
    {data?.packages.slice(0, 6).map(p => p.imageUrl && <div key={p.slug}><Image src={p.imageUrl} alt="" fill unoptimized sizes="34vw"/></div>)}
   </div>
   <div className="travel-hero-shade"/>
   <div className="travel-hero-content">
    <h1>CATCH THE SHOW. STAY CLOSE.</h1>
    <p>Get your tickets and a bed close to the venue. Plan the whole trip in one place.</p>
    <TravelSearch cities={data?.cities ?? []}/>
   </div>
  </section>

  <section className="travel-section">
   <h2>Event Tickets + Hotels: Two Ways to Plan</h2>
   <p className="travel-sub">Start from one of our picks, or build the trip yourself.</p>
   <div className="ways-grid">
    <div className="way-intro"><h3>Two Easy Ways to Book</h3><p>Choose the route that suits your trip</p><span aria-hidden="true">⟶</span></div>
    <Link href="#packages" className="way-card" style={{ backgroundImage: data?.packages[0]?.imageUrl ? `linear-gradient(#000000aa,#000000ee),url(${data.packages[0].imageUrl})` : undefined }}>
     <h3>Ready-Made Trip Picks</h3><p>Popular shows with hotels nearby</p>
     <ul><li><Check/><b>Easy:</b> tickets and a nearby hotel in one checkout</li><li><Check/><b>Popular:</b> the shows with the most dates</li><li><Check/><b>Flexible:</b> pick the night that suits you</li></ul>
    </Link>
    <Link href="/?browse=all#results" className="way-card" style={{ backgroundImage: data?.packages[1]?.imageUrl ? `linear-gradient(#000000aa,#000000ee),url(${data.packages[1].imageUrl})` : undefined }}>
     <h3>Build Your Own Trip</h3><p>Choose your own tickets and hotel</p>
     <ol><li><span>1</span>Choose your tickets</li><li><span>2</span>Choose your hotel</li><li><span>3</span>Review and book</li></ol>
    </Link>
   </div>
  </section>

  <section className="travel-section" id="packages">
   <h2>Trip Picks for Hot Events</h2>
   {!data ? <p className="travel-sub">Listings are temporarily unavailable. Please try again shortly.</p> :
    <div className="package-grid">{data.packages.map((p, i) => <article className="package-card" key={p.slug} style={{ marginTop: i % 3 === 1 ? 60 : 0 }}>
     <Link href={p.href} className="package-link" aria-label={`${p.title}: see tickets`}>
      {p.imageUrl && <Image src={p.imageUrl} alt="" fill unoptimized sizes="(max-width: 700px) 100vw, 33vw"/>}
      <span className={`package-badge badge-${p.badge.split(" ")[0].toLowerCase()}`}>{p.badge}</span>
      <div className="package-body">
       <p>{p.dates > 1 ? `${p.dates} dates · ` : `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(p.startsAt)} · `}{p.where}</p>
       <h3>{p.title}</h3>
       {p.sale === "external"
        ? <ul><li><span className="package-pending" aria-hidden="true"/>Booking opens soon</li><li><Check/>Hotels near the venue</li></ul>
        : <ul><li><Check/>Tickets from {formatPrice(p.fromCents!)}</li>{p.hotelCents !== null ? <li><Check/>Hotel from {formatPrice(p.hotelCents)}/night, one checkout</li> : <li><Check/>Buy here, instant QR tickets</li>}</ul>}
      </div>
      <span className="package-arrow" aria-hidden="true">›</span>
     </Link>
     {p.sale !== "package" && p.hotelFor && <a className="package-hotel" href={hotelSearchUrl(p.hotelFor)} target="_blank" rel="noreferrer">Hotels near {p.venue} ↗</a>}
    </article>)}</div>}
  </section>

  {data && <section className="travel-section">
   <h2>Where to next? The busiest cities for live events.</h2>
   <p className="travel-sub">Pick a city to see what&apos;s on, then find somewhere to stay close to the action.</p>
   <div className="destination-grid">{data.destinations.map(d => <div className="destination-card" key={d.city}>
    {d.imageUrl && <Image src={d.imageUrl} alt="" fill unoptimized sizes="(max-width: 700px) 100vw, 33vw"/>}
    <span className="destination-badge">{d.count} EVENTS</span>
    <div className="destination-body">
     <Link href={`/?city=${encodeURIComponent(d.city)}#results`} className="destination-city">{d.city}</Link>
     <div><small>{d.venues} venue{d.venues === 1 ? "" : "s"}</small>{d.hotelCents !== null
      ? <Link href={`/?city=${encodeURIComponent(d.city)}#results`}>Hotels from {formatPrice(d.hotelCents)}</Link>
      : <a href={hotelSearchUrl(d.city)} target="_blank" rel="noreferrer">Hotels ↗</a>}</div>
    </div>
   </div>)}</div>
   <div className="travel-center"><Link href="/?browse=all#results" className="travel-button">Find My Event</Link></div>
  </section>}

  <section className="travel-trust" aria-label="Why book with us">
   <h2>Real events.</h2><h2>Hotels close by.</h2><h2>Unforgettable nights.</h2><h2 className="accent">LA Tickets has you covered.</h2>
  </section>

  <section className="travel-section travel-faq">
   <h2>FAQ</h2>
   <details><summary>Can I book my hotel here?</summary><p>Yes, for shows marked “Ticket + Hotel”. Pick your tickets, tick “Add a hotel near the venue”, choose your room and dates, and pay once. Your QR tickets and hotel booking are on your order page straight away; show the booking reference and photo ID at check-in.</p></details>
   <details><summary>Where do I buy the tickets?</summary><p>Choose an event with available tickets and complete your booking and payment here. Events without confirmed ticket prices and inventory cannot be booked yet.</p></details>
   <details><summary>Is airfare included?</summary><p>No. Flights and other travel are not included. Plan your travel separately and leave time to get to the venue.</p></details>
   <details><summary>I have another question. Who do I contact?</summary><p>See <Link href="/#help" className="underline">Help</Link> on the home page, or contact the ticket seller shown on your event.</p></details>
  </section>
 </div>;
}
