import type { Performer, Venue } from "@prisma/client";

const socials = [
  ["homepage", "Website"], ["instagram", "Instagram"], ["youtube", "YouTube"], ["spotify", "Spotify"],
  ["tiktok", "TikTok"], ["twitter", "X"], ["facebook", "Facebook"], ["wiki", "Wikipedia"],
] as const;

/** Artists, teams or shows appearing at the event, with their official links. */
export function Performers({ performers }: { performers: Performer[] }) {
  if (!performers.length) return null;
  return (
    <section className="event-section" aria-labelledby="performers-h">
      <h2 id="performers-h">{performers.length > 1 ? "Line-up" : "About the artist"}</h2>
      <ul className="performer-list">
        {performers.map((p) => {
          const links = socials.filter(([key]) => p[key]);
          return (
            <li key={p.name} className="performer">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote Ticketmaster artwork
                <img src={p.imageUrl} alt="" width={96} height={64} loading="lazy" />
              ) : (
                <span className="performer-initial" aria-hidden="true">{p.name.charAt(0)}</span>
              )}
              <div>
                <p className="performer-name">{p.name}</p>
                {p.genre && <p className="performer-genre">{p.genre}</p>}
                {links.length > 0 && (
                  <p className="performer-links">
                    {links.map(([key, label]) => (
                      <a key={key} href={p[key]!} target="_blank" rel="noopener noreferrer">{label}</a>
                    ))}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Getting there and visiting the venue: map, parking, accessibility, box office and house rules. */
export function VenueInfo({ venue, seatmapUrl, ageRestriction }: { venue: Venue; seatmapUrl: string | null; ageRestriction: string | null }) {
  const place = [venue.address, venue.city, venue.state, venue.postalCode, venue.country].filter(Boolean).join(", ");
  const hasCoords = venue.latitude != null && venue.longitude != null;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hasCoords ? `${venue.latitude},${venue.longitude}` : `${venue.name}, ${place}`)}`;
  const details = [
    ["Parking", venue.parking],
    ["Accessibility", venue.accessibility],
    ["Box office hours", venue.boxOfficeHours],
    ["Payment at the venue", venue.payment],
    ["Venue rules", venue.generalRule],
    ["Children", venue.childRule],
  ].filter((d): d is [string, string] => !!d[1]);

  return (
    <section className="event-section" aria-labelledby="venue-h">
      <h2 id="venue-h">Venue information</h2>
      <div className="venue-card">
        <p className="venue-name">{venue.name}</p>
        {place && <p>{place}</p>}
        <p className="venue-actions">
          <a href={mapUrl} target="_blank" rel="noopener noreferrer">Get directions ↗</a>
          {seatmapUrl && <a href={seatmapUrl} target="_blank" rel="noopener noreferrer">View seat map ↗</a>}
          {venue.boxOfficePhone && <span>Box office: {venue.boxOfficePhone}</span>}
        </p>
        {ageRestriction && <p className="venue-age">{ageRestriction}</p>}
      </div>
      {details.length > 0 && (
        <div className="venue-details">
          {details.map(([label, value]) => (
            <details key={label}>
              <summary>{label}</summary>
              <p>{value}</p>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
