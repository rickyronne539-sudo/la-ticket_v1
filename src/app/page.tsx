import { exchangeRateFor } from "@/lib/exchange-rates";
import { convertCents, eventCurrency, ticketPriceCents } from "@/lib/pricing";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { DiscoveryHome } from "@/components/discovery-home";
import { type Category, type Prisma } from "@prisma/client";

export default async function Home(props: PageProps<"/">) {
  await connection();
  const params = await props.searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const query = value("q").trim().slice(0, 150);
  const city = value("city").trim().slice(0, 100);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value("date")) && Number.isFinite(Date.parse(value("date"))) ? value("date") : "";
  const category = ["CONCERT", "SPORTS", "ARTS", "THEATRE", "FAMILY"].includes(value("category")) ? value("category") as Category : undefined;
  const page = Math.min(1000, Math.max(1, Number.parseInt(value("page"), 10) || 1));
  const searching = !!(query || city || date || category || value("browse"));
  const where: Prisma.EventWhereInput = {
    published: true,
    startsAt: { gte: date ? new Date(Math.max(Date.parse(date) - 14 * 60 * 60 * 1000, new Date().getTime())) : new Date() },
    ...(category ? { category: category === "ARTS" ? { in: ["ARTS", "THEATRE"] as Category[] } : category } : {}),
    ...(city ? { "venue": { is: { city: { contains: city, mode: "insensitive" as const } } } } : {}),
    ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" as const } }, { venue: { is: { name: { contains: query, mode: "insensitive" as const } } } }] } : {}),
  };
  const data = await loadListings(where, date, searching, page).catch(() => null);
  const events = data?.[1] ?? [];
  const audRate = events.some(e => eventCurrency(e.venue) === "AUD") ? await exchangeRateFor("AUD").catch(() => null) : null;
  return <DiscoveryHome query={query} city={city} date={date} category={category ?? ""} page={page} searching={searching} count={data?.[0] ?? 0} unavailable={data === null} events={events.map(event => {
    const currency = eventCurrency(event.venue);
    const rate = currency === "AUD" ? audRate?.exchangeRate : 1;
    return { id: event.id, slug: event.slug, title: event.title, startsAt: event.startsAt.toISOString(), venue: event.venue, imageUrl: event.imageUrl, externalUrl: event.externalUrl, externalPriceMin: event.externalPriceMin, externalPriceMax: event.externalPriceMax, externalCurrency: event.externalCurrency, currency,
      localPrice: rate && event.ticketTypes.length ? Math.min(...event.ticketTypes.map(t => convertCents(ticketPriceCents(t.priceCents), rate))) : null,
      bookable: event.ticketTypes.some(t => t.unlimited || t.available > 0),
    };
  })} />;
}

async function loadListings(where: Prisma.EventWhereInput, date: string, searching: boolean, page: number) {
  let filtered = where;
  if (date) {
    // The selected date is interpreted in each venue's timezone, including New Year's Eve.
    const candidates = await prisma.event.findMany({ where, select: { id: true, startsAt: true, venue: true } });
    const ids = candidates.filter(event => {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: event.venue.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(event.startsAt);
      const part = (type: string) => parts.find(value => value.type === type)?.value;
      return `${part("year")}-${part("month")}-${part("day")}` >= date;
    }).map(event => event.id);
    filtered = { ...where, id: { in: ids } };
  }
  return Promise.all([
    prisma.event.count({ where: filtered }),
    searching ? prisma.event.findMany({ where: filtered, orderBy: [{ startsAt: "asc" }, { id: "asc" }], skip: (page - 1) * 24, take: 24, include: { ticketTypes: { select: { priceCents: true, unlimited: true, available: true } } } }) : Promise.resolve([]),
  ]);
}
