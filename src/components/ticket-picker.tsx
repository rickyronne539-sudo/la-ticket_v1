"use client";

import { useActionState, useMemo, useState } from "react";
import { startCheckout, type CheckoutState } from "@/app/events/[slug]/actions";
import { formatPrice } from "@/lib/format";

type TicketTypeOption = {
  id: string;
  name: string;
  priceCents: number;
  available: number;
  unlimited: boolean;
  maxPerOrder: number;
};

type RoomOption = { id: string; name: string; sleeps: number; nightlyCents: number; maxRooms: number; availability: Record<string, number> };
export type HotelOption = { id: string; name: string; address: string; stars: number | null; imageUrl: string | null; description: string; rooms: RoomOption[] };

// Plain calendar arithmetic on YYYY-MM-DD (the server checks the same rules).
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const nightsBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d < to && out.length < 14; d = shift(d, 1)) out.push(d);
  return out;
};
const pretty = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function TicketPicker({
  eventId,
  accountEmail,
  ticketTypes,
  devPayments,
  eventDay = null,
  hotels = [],
}: {
  eventId: string;
  accountEmail: string;
  ticketTypes: TicketTypeOption[];
  devPayments: boolean;
  eventDay?: string | null;
  hotels?: HotelOption[];
}) {
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(startCheckout, {});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [withHotel, setWithHotel] = useState(false);
  const [roomId, setRoomId] = useState(hotels[0]?.rooms[0]?.id ?? "");
  const [checkIn, setCheckIn] = useState(eventDay ?? "");
  const [checkOut, setCheckOut] = useState(eventDay ? shift(eventDay, 1) : "");
  const [rooms, setRooms] = useState(1);

  const ticketTotal = ticketTypes.reduce((sum, t) => sum + t.priceCents * (quantities[t.id] ?? 0), 0);
  const count = Object.values(quantities).reduce((a, b) => a + b, 0);

  const room = hotels.flatMap(h => h.rooms.map(r => ({ ...r, hotel: h }))).find(r => r.id === roomId);
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : [];
  // Fewest rooms left over the chosen nights; a night with no listing has none.
  const roomsLeft = room && nights.length ? Math.min(...nights.map(n => room.availability[n] ?? 0)) : 0;
  const stayProblem = !withHotel ? null
    : !room ? "Choose a room."
    : !nights.length ? "Check-out must be after check-in."
    : eventDay && !(checkIn <= eventDay && eventDay <= checkOut) ? "Your stay must include the night of the show."
    : roomsLeft < rooms ? (roomsLeft ? `Only ${roomsLeft} room${roomsLeft > 1 ? "s" : ""} left for those dates.` : "No rooms left on one of those nights. Try other dates or another room.")
    : null;
  const stayTotal = withHotel && room && !stayProblem ? room.nightlyCents * nights.length * rooms : 0;
  const total = ticketTotal + stayTotal;
  const minDate = eventDay ? shift(eventDay, -3) : undefined, maxDate = eventDay ? shift(eventDay, 3) : undefined;
  const roomCap = room ? Math.min(room.maxRooms, Math.max(1, roomsLeft)) : 1;
  const days = useMemo(() => (eventDay ? Array.from({ length: 7 }, (_, i) => shift(eventDay, i - 3)) : []), [eventDay]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />

      <ul className="divide-y divide-black/10 dark:divide-white/10">
        {ticketTypes.map((t) => {
          const max = t.unlimited ? t.maxPerOrder : Math.min(t.available, t.maxPerOrder);
          return (
            <li key={t.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-sm opacity-70">
                  {t.priceCents === 0 ? "Free" : formatPrice(t.priceCents)}
                  {t.unlimited ? " · Unlimited availability" : t.available === 0 ? " · Sold out" : t.available <= 20 ? ` · ${t.available} left` : ""}
                </p>
              </div>
              <input type="hidden" name="ticketTypeId" value={t.id} />
              <select
                name="quantity"
                aria-label={`Quantity for ${t.name}`}
                disabled={max === 0}
                value={quantities[t.id] ?? 0}
                onChange={(e) => setQuantities((q) => ({ ...q, [t.id]: Number(e.target.value) }))}
                className="rounded-md border border-black/15 bg-transparent px-2 py-1 disabled:opacity-40 dark:border-white/15"
              >
                {Array.from({ length: max + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>

      {hotels.length > 0 && (
        <fieldset className="stay-box">
          <label className="stay-toggle">
            <input type="checkbox" checked={withHotel} onChange={(e) => setWithHotel(e.target.checked)} />
            <span><strong>Add a hotel near the venue</strong><br /><small>Book your room with your tickets, in one payment.</small></span>
          </label>
          {withHotel && (
            <div className="stay-options">
              {hotels.map((h) => (
                <div key={h.id} className="stay-hotel">
                  <p className="stay-hotel-name">{h.name}{h.stars ? <span aria-label={`${h.stars} stars`}> {"★".repeat(h.stars)}</span> : null}</p>
                  <p className="stay-hotel-address">{h.address}</p>
                  {h.rooms.map((r) => (
                    <label key={r.id} className="stay-room">
                      <input type="radio" name="roomTypeId" value={r.id} checked={roomId === r.id} onChange={() => { setRoomId(r.id); setRooms(1); }} />
                      <span>{r.name} <small>· sleeps {r.sleeps}</small></span>
                      <strong>{formatPrice(r.nightlyCents)}<small>/night</small></strong>
                    </label>
                  ))}
                </div>
              ))}
              {room && days.length > 0 && (
                <div className="stay-calendar" aria-label="Rooms left per night">
                  {days.map((d) => {
                    const left = room.availability[d] ?? 0;
                    return <span key={d} className={`${nights.includes(d) ? "in" : ""} ${left ? "" : "none"} ${d === eventDay ? "show" : ""}`} title={`${pretty(d)}: ${left} room${left === 1 ? "" : "s"} left`}>
                      {pretty(d).split(",")[0]}<b>{new Date(`${d}T12:00:00Z`).getUTCDate()}</b><i>{left ? `${left} left` : "full"}</i>
                    </span>;
                  })}
                </div>
              )}
              <div className="stay-dates">
                <label>Check-in<input type="date" name="checkIn" required value={checkIn} min={minDate} max={maxDate} onChange={(e) => { setCheckIn(e.target.value); if (checkOut <= e.target.value) setCheckOut(shift(e.target.value, 1)); }} /></label>
                <label>Check-out<input type="date" name="checkOut" required value={checkOut} min={checkIn ? shift(checkIn, 1) : minDate} max={maxDate ? shift(maxDate, 1) : undefined} onChange={(e) => setCheckOut(e.target.value)} /></label>
                <label>Rooms<select name="rooms" value={rooms} onChange={(e) => setRooms(Number(e.target.value))}>{Array.from({ length: roomCap }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label>
              </div>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Name for the hotel booking</span>
                <input name="guestName" required minLength={2} maxLength={120} autoComplete="name" placeholder="As on your ID" className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 dark:border-white/15" />
              </label>
              {stayProblem ? <p className="text-sm text-amber-700">{stayProblem}</p>
                : room && <p className="text-sm">{room.hotel.name}, {room.name}: {rooms} room{rooms > 1 ? "s" : ""} × {nights.length} night{nights.length > 1 ? "s" : ""} = <strong>{formatPrice(stayTotal)}</strong></p>}
            </div>
          )}
        </fieldset>
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium">Account email for your receipt and tickets{withHotel ? " and booking" : ""}</span>
        <input
          type="email"
          name="email"
          required
          value={accountEmail}
          readOnly
          className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
        />
      </label>

      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || count === 0 || !!stayProblem}
        className="w-full rounded-md bg-foreground px-4 py-2.5 font-medium text-background disabled:opacity-40"
      >
        {pending ? "Reserving…" : count === 0 ? "Select tickets" : `Checkout · ${formatPrice(total)}`}
      </button>

      <p className="text-xs opacity-60">
        Tickets{withHotel ? " and rooms are" : " are"} held for 30 minutes while you pay.
        {devPayments && " Dev mode: Stripe isn't configured, so orders are confirmed without payment."}
      </p>
    </form>
  );
}
