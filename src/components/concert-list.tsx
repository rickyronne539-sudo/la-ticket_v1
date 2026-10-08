"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate, formatPrice } from "@/lib/format";

type Concert = {
  id: string; slug: string; title: string; startsAt: string;
  venue: { name: string; city: string; timezone: string };
  externalUrl: string | null;
  externalPriceMin: number | null; externalPriceMax: number | null; externalCurrency: string | null;
  ticketTypes: { name: string; priceCents: number; available: number }[];
};

function localDate(event: Concert) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: event.venue.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(event.startsAt));
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? "";
  return { month: `${part("year")}-${part("month")}`, day: Number(part("day")) };
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
}

export function ConcertList({ events, unavailable = false }: { events: Concert[]; unavailable?: boolean }) {
  const [location, setLocation] = useState("");
  const [month, setMonth] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const dates = useMemo(() => new Map(events.map((event) => [event.id, localDate(event)])), [events]);
  const months = [...new Set(events.map((event) => dates.get(event.id)!.month))].sort();
  const filtered = events.filter((event) =>
    `${event.title} ${event.venue.city} ${event.venue.name}`.toLowerCase().includes(location.trim().toLowerCase()) && (!month || dates.get(event.id)!.month === month),
  );
  const shownMonths = [...new Set(filtered.map((event) => dates.get(event.id)!.month))].sort();
  const eventsByDay = new Map<string, Concert[]>();
  for (const event of filtered) {
    const date = dates.get(event.id)!;
    const key = `${date.month}-${date.day}`;
    const dayEvents = eventsByDay.get(key) ?? [];
    dayEvents.push(event);
    eventsByDay.set(key, dayEvents);
  }

  return (
    <section id="tour-dates" className="concert-section">
      <div className="concert-heading"><h2>Events <span aria-live="polite">{unavailable ? "Temporarily unavailable" : `${filtered.length} Results`}</span></h2><div className="view-switch" aria-label="Event view"><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}><span aria-hidden="true">☰</span> List</button><button type="button" aria-pressed={view === "calendar"} onClick={() => setView("calendar")}><span aria-hidden="true">▦</span> Calendar</button></div></div>
      <div className="concert-layout">
        <div>
          <div className="concert-filters">
            <label><span>Location</span><span className="filter-input"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg><input type="search" placeholder="City, venue or artist" value={location} onChange={(event) => setLocation(event.target.value)} /></span></label>
            <label><span id="concert-dates-label">Dates</span><select aria-labelledby="concert-dates-label" value={month} onChange={(event) => setMonth(event.target.value)}><option value="">All Dates</option>{months.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}</select></label>
          </div>
          <div className="results-heading"><h3>All upcoming events</h3><span>Venue local time</span></div>
          {unavailable ? <div className="empty-concerts" role="status"><h3>Event listings are temporarily unavailable</h3><p>We couldn&apos;t load the latest tickets. Please try again in a moment.</p><button type="button" className="text-link" onClick={() => window.location.reload()}>Try again</button></div> : filtered.length === 0 ? <div className="empty-concerts"><h3>No events found</h3><p>{events.length ? "Try a different city or date to find your show." : "There are no upcoming shows available right now. Check back for new dates."}</p>{(location || month) && <button type="button" className="text-link" onClick={() => { setLocation(""); setMonth(""); }}>Clear filters</button>}</div> : view === "list" ? (
            <ul className="concert-list">{filtered.map((event) => {
              const date = new Date(event.startsAt);
              const tickets = event.ticketTypes.filter((ticket) => ticket.available > 0);
              const from = tickets.length ? Math.min(...tickets.map((ticket) => ticket.priceCents)) : null;
              return <li key={event.id} className="concert-row">
                <div className="date-badge"><span>{new Intl.DateTimeFormat("en-US", { month: "short", timeZone: event.venue.timezone }).format(date)}</span><strong>{dates.get(event.id)!.day}</strong></div>
                <div className="concert-info"><p className="concert-time">{new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: event.venue.timezone }).format(date)}</p><h4>{event.venue.city} <span>• {event.venue.name}</span></h4><p>{event.title}</p></div>
                <div className="concert-action"><span>{from === null ? "Booking unavailable" : from === 0 ? "Free" : `From ${formatPrice(from)}`}</span><Link href={`/events/${event.slug}`} className="ticket-button">{from === null ? "View Details" : "Book Tickets"}<span aria-hidden="true">›</span></Link></div>
              </li>;
            })}</ul>
          ) : <div className="concert-calendars">{shownMonths.map((value) => {
            const first = new Date(`${value}-01T12:00:00Z`);
            const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
            return <section key={value} className="concert-calendar"><h3>{monthLabel(value)}</h3><div className="calendar-grid">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="calendar-weekday">{day}</div>)}{Array.from({ length: first.getUTCDay() }, (_, index) => <div key={`blank-${index}`} className="calendar-blank" />)}{Array.from({ length: days }, (_, index) => <div key={index} className="calendar-day"><span>{index + 1}</span>{(eventsByDay.get(`${value}-${index + 1}`) ?? []).map((event) => <Link key={event.id} href={`/events/${event.slug}`} title={`${event.venue.name} · ${formatDate(new Date(event.startsAt), event.venue.timezone)}`}>{event.venue.city}</Link>)}</div>)}</div></section>;
          })}</div>}
        </div>
        <aside className="concert-sidebar"><div className="artist-promo"><span className="section-eyebrow">The live experience</span><h3>Some nights<br/>stay with you.</h3><p>Find your city.<br/>Find your next live event.</p><a href="#about">Discover our featured artist <span aria-hidden="true">↗</span></a></div><div className="booking-note"><span aria-hidden="true">✓</span><div><h3>Your next show starts here</h3><p>Browse live availability and choose the tickets that work for you.</p></div></div></aside>
      </div>
    </section>
  );
}

