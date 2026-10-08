// Imports upcoming events from the Ticketmaster Discovery API (https://developer.ticketmaster.com).
// Ticket availability is configured separately for selected event dates.
//
//   pnpm tm:sync
//
// Needs TICKETMASTER_API_KEY in .env. Defaults to the featured listings below.
// Optional TICKETMASTER_KEYWORD limits the import. Existing unrelated listings are preserved.
//
//   --country=AU   import from another country (two-letter code; default US)
//   --all          every event in that country (music, sports, arts...) for the next
//                  TICKETMASTER_DAYS days, instead of the featured keywords
//   --days=365     overrides TICKETMASTER_DAYS (max 365)
//   --city="Los Angeles"  only events in that city (use with --all)
import { createHash } from "node:crypto";
import { PrismaClient, type Category } from "@prisma/client";

const prisma = new PrismaClient();

const apiKey = process.env.TICKETMASTER_API_KEY;
const featured = [
  "Oasis", "Eagles", "JAY-Z", "Metallica", "Harry Styles", "Lady A",
  "Brooklyn Nets", "Golden State Warriors", "Las Vegas Raiders", "Miami Heat",
  "Hamilton", "The Wizard of Oz at Sphere", "Dave Chappelle", "John Mulaney",
  "Matt Rife", "Jo Koy", "Disney On Ice", "Harlem Globetrotters",
];
// `--concerts`: every US music event in the next TICKETMASTER_DAYS days (default 30, about
// 6,000 shows) -- the listings behind ticketmaster.com/discover/concerts -- instead of the featured keywords.
const concerts = process.argv.includes("--concerts");
const everything = process.argv.includes("--all");
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const country = (arg("country") ?? "US").toUpperCase();
const city = arg("city")?.trim();
if (!/^[A-Z]{2}$/.test(country)) throw new Error("--country must be a two-letter code, e.g. --country=AU.");
const days = Math.min(365, Math.max(1, Number(arg("days") ?? process.env.TICKETMASTER_DAYS) || 30));
const byDate = concerts || everything;
const keywords = byDate ? [""] : process.env.TICKETMASTER_KEYWORD?.trim() ? [process.env.TICKETMASTER_KEYWORD.trim()] : featured;

type TmVenue = {
  name?: string;
  address?: { line1?: string };
  city?: { name?: string };
  state?: { name?: string; stateCode?: string };
  country?: { name?: string; countryCode?: string };
  postalCode?: string;
  location?: { latitude?: string; longitude?: string };
  timezone?: string;
  parkingDetail?: string;
  accessibleSeatingDetail?: string;
  boxOfficeInfo?: { phoneNumberDetail?: string; openHoursDetail?: string; acceptedPaymentDetail?: string };
  generalInfo?: { generalRule?: string; childRule?: string };
};
type TmLinks = Partial<Record<"homepage" | "instagram" | "youtube" | "spotify" | "tiktok" | "twitter" | "facebook" | "wiki", { url?: string }[]>>;
type TmAttraction = {
  name?: string;
  images?: { url: string; width: number; ratio?: string }[];
  classifications?: { genre?: { name?: string } }[];
  externalLinks?: TmLinks;
};
type TmEvent = {
  id: string;
  name: string;
  url: string;
  images?: { url: string; width: number; ratio?: string }[];
  priceRanges?: { type?: string; currency: string; min: number; max: number }[];
  info?: string;
  pleaseNote?: string;
  dates: { start: { dateTime?: string; localDate?: string }; timezone?: string; status?: { code?: string } };
  classifications?: { segment?: { name?: string } }[];
  seatmap?: { staticUrl?: string };
  ageRestrictions?: { legalAgeEnforced?: boolean; ageRuleDescription?: string };
  _embedded?: { venues?: TmVenue[]; attractions?: TmAttraction[] };
};
type TmPage = { _embedded?: { events: TmEvent[] }; page: { number: number; totalPages: number; totalElements: number } };

const categories: Record<string, Category> = {
  Music: "CONCERT",
  Sports: "SPORTS",
  "Arts & Theatre": "THEATRE",
  Family: "FAMILY",
};

async function fetchPage(keyword: string, start: number, end: number, page = 0): Promise<TmPage> {
  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  const iso = (time: number) => new Date(time).toISOString().replace(".000Z", "Z");
  url.search = new URLSearchParams({
    apikey: apiKey!, ...(keyword ? { keyword } : {}), ...(concerts ? { classificationName: "music" } : {}),
    countryCode: country, ...(city ? { city } : {}), source: "ticketmaster",
    size: "200", page: String(page), sort: "date,asc",
    startDateTime: iso(start), endDateTime: iso(end),
  }).toString();
  // Stay below the default five requests per second quota.
  await new Promise((resolve) => setTimeout(resolve, 250));
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Ticketmaster API returned HTTP ${res.status} for ${keyword || (concerts ? "concerts" : "all events")}.`);
  const data = await res.json() as TmPage;
  if (!data.page || !Number.isInteger(data.page.totalElements)) throw new Error("Invalid Ticketmaster response.");
  return data;
}

async function fetchEvents(keyword: string, start: number, end: number): Promise<TmEvent[]> {
  const first = await fetchPage(keyword, start, end);
  // Split the date range to avoid silently dropping results beyond the 1,000-result limit.
  if (first.page.totalElements > 1000) {
    const midpoint = Math.floor((start + end) / 2000) * 1000;
    if (midpoint <= start || midpoint >= end) throw new Error(`Too many simultaneous events for ${keyword || (concerts ? "concerts" : "all events")}; narrow the query.`);
    return [...await fetchEvents(keyword, start, midpoint), ...await fetchEvents(keyword, midpoint + 1000, end)];
  }
  const events = first._embedded?.events ?? [];
  for (let page = 1; page < first.page.totalPages; page++) {
    events.push(...((await fetchPage(keyword, start, end, page))._embedded?.events ?? []));
  }
  return events;
}

/**
 * The API wraps links in an affiliate redirect (ticketmaster.evyy.net/...?u=<real link>)
 * carrying the account's affiliate ID. Store the real ticketmaster.com link instead.
 */
function realTicketmasterUrl(url: string) {
  try {
    const parsed = new URL(url);
    const inner = parsed.searchParams.get("u");
    if (parsed.hostname.endsWith("evyy.net") && inner) return new URL(inner).toString();
  } catch {
    /* fall through to the original */
  }
  return url;
}

/**
 * Ticketmaster ids are case-sensitive: "1AKZkf-GkeNmNIA" and "1AKZkf-GkeNmNIa" are different
 * shows. Slugs are lowercase, so a short hash of the exact id keeps them apart.
 */
const slugFor = (id: string) => `tm-${id.toLowerCase()}-${createHash("sha1").update(id).digest("hex").slice(0, 6)}`;
/** Slug used before the hash was added; still matched so existing pages keep their URLs. */
const legacySlugFor = (id: string) => `tm-${id}`.toLowerCase();

/** Venue text fields are free-form; keep them tidy and bounded. */
const text = (value: string | undefined, max = 1500) => {
  const clean = value?.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
};
/** Only plain web links are stored, so nothing odd ever ends up in an href. */
const webUrl = (value: string | undefined) => {
  try {
    const url = new URL(realTicketmasterUrl(value ?? ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};
const coordinate = (value: string | undefined) => (value && Number.isFinite(Number(value)) ? Number(value) : null);
const widest = (images: { url: string; width: number; ratio?: string }[] | undefined, ratio: string) =>
  images?.filter((image) => image.ratio === ratio).sort((a, b) => b.width - a.width)[0]?.url ?? null;

function toPerformer(a: TmAttraction) {
  if (!a.name) return null;
  const link = (key: keyof TmLinks) => webUrl(a.externalLinks?.[key]?.[0]?.url);
  const genre = a.classifications?.[0]?.genre?.name;
  return {
    name: a.name,
    imageUrl: webUrl(widest(a.images, "3_2") ?? widest(a.images, "16_9") ?? undefined),
    genre: genre && genre !== "Undefined" ? genre : null,
    homepage: link("homepage"), instagram: link("instagram"), youtube: link("youtube"), spotify: link("spotify"),
    tiktok: link("tiktok"), twitter: link("twitter"), facebook: link("facebook"), wiki: link("wiki"),
  };
}

function toEvent(tm: TmEvent) {
  const venue = tm._embedded?.venues?.[0];
  const timezone = tm.dates.timezone ?? venue?.timezone ?? "UTC";
  // Date-only listings ("time TBA") get noon UTC so they land on the right day.
  const startsAt = tm.dates.start.dateTime ?? (tm.dates.start.localDate && `${tm.dates.start.localDate}T12:00:00Z`);
  if (!startsAt) return null;
  const range = tm.priceRanges?.find((price) => price.type === "standard") ?? tm.priceRanges?.[0];
  const validPrice = range && /^[A-Z]{3}$/.test(range.currency) && Number.isFinite(range.min) && range.min >= 0;
  return {
    externalPriceMin: validPrice ? range.min : null,
    externalPriceMax: validPrice && Number.isFinite(range.max) && range.max >= range.min ? range.max : null,
    externalCurrency: validPrice ? range.currency : null,
    externalPriceCheckedAt: new Date(),
    imageUrl: tm.images?.filter((image) => image.ratio === "16_9").sort((a, b) => b.width - a.width)[0]?.url ?? null,
    slug: slugFor(tm.id),
    legacySlug: legacySlugFor(tm.id),
    title: tm.name,
    description: tm.info ?? tm.pleaseNote ?? `${tm.name} at ${venue?.name ?? "venue TBA"}. Tickets are sold on Ticketmaster.`,
    category: categories[tm.classifications?.[0]?.segment?.name ?? ""] ?? "ARTS",
    venue: {
      name: venue?.name ?? "Venue TBA",
      address: venue?.address?.line1 ?? "",
      city: venue?.city?.name ?? "",
      timezone,
      state: text(venue?.state?.name, 80),
      postalCode: text(venue?.postalCode, 20),
      country: text(venue?.country?.name, 80),
      latitude: coordinate(venue?.location?.latitude),
      longitude: coordinate(venue?.location?.longitude),
      parking: text(venue?.parkingDetail),
      accessibility: text(venue?.accessibleSeatingDetail),
      boxOfficePhone: text(venue?.boxOfficeInfo?.phoneNumberDetail, 200),
      boxOfficeHours: text(venue?.boxOfficeInfo?.openHoursDetail),
      payment: text(venue?.boxOfficeInfo?.acceptedPaymentDetail),
      generalRule: text(venue?.generalInfo?.generalRule),
      childRule: text(venue?.generalInfo?.childRule),
    },
    performers: (tm._embedded?.attractions ?? []).map(toPerformer).filter((p) => p !== null).slice(0, 12),
    seatmapUrl: webUrl(tm.seatmap?.staticUrl),
    ageRestriction: text(tm.ageRestrictions?.ageRuleDescription, 200) ?? (tm.ageRestrictions?.legalAgeEnforced ? "Age restrictions apply" : null),
    startsAt: new Date(startsAt),
    externalUrl: realTicketmasterUrl(tm.url),
    published: tm.dates.status?.code !== "cancelled",
  };
}

async function main() {
  if (!apiKey) throw new Error("Set TICKETMASTER_API_KEY in .env (free key at https://developer.ticketmaster.com).");
  const all = new Map<string, TmEvent>();
  const start = Math.floor(Date.now() / 1000) * 1000;
  for (const keyword of keywords) {
    const end = byDate ? start + days * 86_400_000 : Date.UTC(2100, 0, 1);
    const events = await fetchEvents(keyword, start, end);
    for (const event of events) all.set(event.id, event);
    console.log(`${keyword || `${concerts ? "Concerts" : "All events"} (next ${days} days)`}: ${events.length} upcoming ${city ? `${city}, ` : ""}${country} events.`);
  }
  const found = [...all.values()].map(toEvent).filter((event) => event !== null);
  // Load what's already here once, so each show is matched in memory instead of one query per event.
  const existingRows = await prisma.event.findMany({ where: { externalUrl: { not: null } }, select: { id: true, slug: true, externalUrl: true } });
  const pageIdOf = (url: string | null) => url?.match(/\/event\/([A-Za-z0-9]+)/)?.[1] ?? null;
  const bySlug = new Map(existingRows.map((row) => [row.slug, row]));
  const byPageId = new Map(existingRows.flatMap((row) => { const id = pageIdOf(row.externalUrl); return id ? [[id, row] as const] : []; }));
  let updated = 0, created = 0, done = 0;
  // The same show may already be here from the public-page import (slug "tm-public-<page id>"):
  // match it by the event id in its ticketmaster.com URL and update it in place, so nothing is duplicated.
  const save = async ({ legacySlug, ...event }: NonNullable<ReturnType<typeof toEvent>>) => {
    const pageId = pageIdOf(event.externalUrl);
    // An old lowercase slug may belong to this show's case-twin, so only trust it when the link matches.
    const legacy = bySlug.get(legacySlug);
    const existing = bySlug.get(event.slug)
      ?? (legacy?.externalUrl === event.externalUrl ? legacy : undefined)
      ?? (pageId ? bySlug.get(`tm-public-${pageId}`) ?? byPageId.get(pageId) : undefined);
    if (existing) {
      await prisma.event.update({ where: { id: existing.id }, data: { ...event, slug: existing.slug } });
      updated++;
    } else {
      const row = await prisma.event.create({ data: event, select: { id: true, slug: true, externalUrl: true } });
      bySlug.set(row.slug, row);
      if (pageId) byPageId.set(pageId, row);
      created++;
    }
    if (++done % 250 === 0) console.log(`  saved ${done} of ${found.length}`);
  };
  // A few writes at a time: much faster over a remote database, still gentle on it.
  for (let i = 0; i < found.length; i += 8) await Promise.all(found.slice(i, i + 8).map(save));
  console.log(`Ticketmaster events: ${updated} updated, ${created} new; ${found.filter((event) => event.externalPriceMin !== null).length} with published prices.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message.replaceAll(apiKey || "__NO_KEY__", "[redacted]") : "Ticketmaster sync failed.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
