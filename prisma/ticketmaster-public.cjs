/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS scripts run directly with Node. */
const fs = require('node:fs');
const path = require('node:path');
const sources = [
 ['Oasis','oasis',766720,'CONCERT'], ['Eagles','eagles',734977,'CONCERT'],
 ['JAY-Z','jayz',781009,'CONCERT'], ['Metallica','metallica',735647,'CONCERT'],
 ['Lady A','lady-a',1173672,'CONCERT'], ['Harry Styles','harry-styles',2366444,'CONCERT'],
 ['Brooklyn Nets','brooklyn-nets',805983,'SPORTS'], ['Golden State Warriors','golden-state-warriors',805946,'SPORTS'],
 ['Las Vegas Raiders','las-vegas-raiders',805994,'SPORTS'], ['Miami Heat','miami-heat',805966,'SPORTS'],
 ['Hamilton','hamilton-touring',2336213,'THEATRE'], ['The Wizard of Oz at Sphere','the-wizard-of-oz-at-sphere',3552227,'THEATRE'],
 ['Dave Chappelle','dave-chappelle',803682,'ARTS'], ['John Mulaney','john-mulaney',1231400,'ARTS'],
 ['Matt Rife','matt-rife',2431961,'ARTS'], ['Jo Koy','jo-koy',1179917,'ARTS'],
 ['Disney On Ice','disney-on-ice-presents-find-your',1742147,'FAMILY'], ['Harlem Globetrotters','harlem-globetrotters',806223,'FAMILY'],
];
const out = path.join(__dirname, 'data', 'ticketmaster-public.json');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function parse(html, artistId, page) {
 const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
 if (!match) throw new Error('No public event data found in the page.');
 const data = JSON.parse(match[1]).props.pageProps;
 const queries = Object.values(data.initialReduxState?.api?.queries ?? {});
 const query = queries.find(q => q.endpointName === 'artistEvents' && String(q.originalArgs?.artistId) === String(artistId) && q.originalArgs?.page === page && !q.originalArgs?.startDate);
 if (!query?.data || !Array.isArray(query.data.events)) throw new Error('Public event list format changed.');
 return { ...query.data, jsonLD: (data.eventsJsonLD ?? []).flat() };
}
function convert(event, category, sourceUrl, jsonLD, scannedAt) {
 if (event.venue?.countryCode !== 'US' || event.partnerEvent || event.cancelled || event.tba || event.postponed) return null;
 if (!event.dates?.startDate || !/Z$|[+-]\d\d:\d\d$/.test(event.dates.startDate)) return null;
 const startsAt = new Date(event.dates.startDate);
 if (!Number.isFinite(startsAt.getTime()) || startsAt < new Date(scannedAt)) return null;
 if (!/^https:\/\/www\.ticketmaster\.com\/.+\/event\/[A-Za-z0-9]+$/.test(event.url)) return null;
 if (!event.timeZone) return null;
 new Intl.DateTimeFormat('en-US', { timeZone: event.timeZone });
 const ld = jsonLD.find(item => item.url === event.url);
 const offers = Array.isArray(ld?.offers) ? ld.offers : [ld?.offers];
 const offer = offers.find(o => o && /^[A-Z]{3}$/.test(o.priceCurrency ?? '') && (o.lowPrice != null || o.price != null));
 const min = offer ? Number(offer.lowPrice ?? offer.price) : NaN;
 const max = offer?.highPrice != null ? Number(offer.highPrice) : null;
 const priced = Number.isFinite(min) && min >= 0;
 return {
  slug: `tm-public-${event.url.split("/").pop()}`,
  title: event.title,
  description: `${event.title} at ${event.venue.name} in ${event.venue.city}. Tickets and current availability are on Ticketmaster.`,
  category,
  venue: { name: event.venue.name, address: event.venue.addressLineOne ?? '', city: event.venue.city, timezone: event.timeZone },
  startsAt: startsAt.toISOString(),
  imageUrl: event.artists?.[0]?.imageUrls?.RETINA_PORTRAIT_16_9 ?? null,
  published: true,
  externalUrl: event.url,
  externalPriceMin: priced ? min : null,
  externalPriceMax: priced && max !== null && Number.isFinite(max) && max >= min ? max : null,
  externalCurrency: priced ? offer.priceCurrency : null,
  externalPriceCheckedAt: scannedAt,
  sourceUrl,
 };
}
async function main() {
 const snapshot = { scannedAt: new Date().toISOString(), scope: 'Upcoming US events from 18 featured Ticketmaster artist/team/show public pages; partner, cancelled, postponed, and undated listings excluded.', sources: [], events: [] };
 const events = new Map();
 fs.mkdirSync(path.dirname(out), { recursive: true });
 for (const [name, slug, artistId, category] of sources) {
  const source = { name, url: `https://www.ticketmaster.com/${slug}-tickets/artist/${artistId}`, pages: 0, found: 0, complete: false };
  snapshot.sources.push(source);
  try {
   let totalPages = 1;
   for (let page = 0; page < totalPages; page++) {
    const url = source.url + (page ? `?page=${page}` : '');
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = parse(await response.text(), artistId, page);
    if (page === 0) totalPages = Math.max(1, Math.ceil(data.total / (data.events.length || 20)));
    if (totalPages > 501) throw new Error('Public listing exceeds supported page limit.');
    if (page > 0 && data.events.length === 0) throw new Error('Unexpected empty public page.');
    for (const row of data.events) {
     const event = convert(row, category, url, data.jsonLD, snapshot.scannedAt);
     if (event) { events.set(event.externalUrl, event); source.found++; }
    }
    source.pages++;
    await sleep(300);
   }
   source.complete = true;
  } catch (error) { source.error = error.message; }
  snapshot.events = [...events.values()].sort((a,b) => a.startsAt.localeCompare(b.startsAt));
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`${name}: ${source.found} listings across ${source.pages} pages${source.error ? `; ${source.error}` : ''}`);
 }
 console.log(`Saved ${snapshot.events.length} unique events, ${snapshot.events.filter(e => e.externalPriceMin !== null).length} with public prices, to ${out}`);
 if (snapshot.sources.some(s => !s.complete)) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { parse, convert };
