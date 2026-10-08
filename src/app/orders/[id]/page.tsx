import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { syncOrderPayment } from "@/lib/payments";
import { formatDate, formatPrice } from "@/lib/format";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

export default async function OrderPage(props: PageProps<"/orders/[id]">) {
  await connection();
  const { id } = await props.params;
  const { t } = await props.searchParams;
  if (!/^[a-f0-9]{24}$/.test(id) || typeof t !== "string") notFound();

  const include = { event: true, tickets: { include: { ticketType: true }, orderBy: { createdAt: "asc" as const } } };
  let order = await prisma.order.findUnique({ where: { id }, include });
  // The access token in the URL is what lets a guest see their tickets.
  if (!order || order.accessToken !== t) notFound();
  if (order.status === "PENDING" && order.stripeSessionId) {
    // Ask Stripe whether this was paid; works without the webhook.
    await syncOrderPayment(order);
    order = (await prisma.order.findUnique({ where: { id }, include }))!;
  }

  const tickets = await Promise.all(
    order.tickets.map(async (ticket) => ({
      ...ticket,
      qr: await QRCode.toDataURL(ticket.code, { margin: 1, width: 220 }),
    })),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <p className="text-sm opacity-60">Order {order.id.slice(-8).toUpperCase()}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{order.event.title}</h1>
        <p className="mt-2 opacity-80">
          {formatDate(order.event.startsAt, order.event.venue.timezone)} · {order.event.venue.name}
        </p>
      </div>

      {order.status === "PENDING" && (
        <div className="rounded-xl border border-black/10 p-5 dark:border-white/10">
          <p className="font-medium">Awaiting payment confirmation…</p>
          <p className="mt-1 text-sm opacity-70">This usually takes a few seconds. The page updates on its own.</p>
          <Link className="mt-3 inline-block text-sm text-blue-700 underline" href={`/orders/${order.id}/checkout?t=${encodeURIComponent(order.accessToken)}`}>Return to payment</Link>
          <AutoRefresh seconds={3} />
        </div>
      )}
      {order.status === "EXPIRED" && (
        <p className="rounded-xl bg-amber-500/10 p-5">This reservation expired before payment was completed.</p>
      )}
      {order.status === "REFUNDED" && (
        <p className="rounded-xl bg-amber-500/10 p-5">
          Sorry, {order.hotelStay ? "the tickets or rooms" : "these tickets"} sold out before your payment went through. You have been fully refunded.
        </p>
      )}

      {order.status === "PAID" && (
        <>
          <p className="rounded-xl bg-emerald-500/10 p-5">
            You&apos;re going! {tickets.length} ticket{tickets.length === 1 ? "" : "s"} for {order.email}. Show the QR
            code at the door. Bookmark this page to find your tickets again.
          </p>
          {order.hotelStay && (
            <div className="rounded-xl border border-black/10 p-5 dark:border-white/10">
              <p className="text-sm opacity-60">Your hotel</p>
              <p className="mt-1 text-lg font-semibold">{order.hotelStay.hotelName}</p>
              <p className="text-sm opacity-80">{order.hotelStay.hotelAddress}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="opacity-60">Check-in</dt><dd>{order.hotelStay.checkIn}</dd></div>
                <div><dt className="opacity-60">Check-out</dt><dd>{order.hotelStay.checkOut}</dd></div>
                <div><dt className="opacity-60">Room</dt><dd>{order.hotelStay.rooms} × {order.hotelStay.roomName}</dd></div>
                <div><dt className="opacity-60">Booked for</dt><dd>{order.hotelStay.guestName}</dd></div>
              </dl>
              <p className="mt-3 text-xs opacity-70">Booking reference {order.id.slice(-8).toUpperCase()}. Give the hotel this reference and photo ID at check-in.</p>
            </div>
          )}
          <ul className="grid gap-4 sm:grid-cols-2">
            {tickets.map((ticket) => (
              <li
                key={ticket.id}
                className="flex flex-col items-center rounded-xl border border-black/10 p-5 text-center dark:border-white/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
                <img src={ticket.qr} alt={`QR code for ticket ${ticket.code}`} width={180} height={180} className="rounded bg-white p-2" />
                <p className="mt-3 font-medium">{ticket.ticketType.name}</p>
                <p className="font-mono text-xs opacity-60">{ticket.code}</p>
                {ticket.checkedInAt && <p className="mt-1 text-xs text-amber-600">Checked in</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="rounded-xl border border-black/10 p-5 text-sm dark:border-white/10">
        {order.items.map((item) => (
          <div key={item.ticketTypeId} className="flex justify-between py-1">
            <span>
              {item.quantity} × {item.name}
            </span>
            <span>{formatPrice(item.priceCents * item.quantity)}</span>
          </div>
        ))}
        {order.hotelStay && (
          <div className="flex justify-between py-1">
            <span>
              {order.hotelStay.rooms} × {order.hotelStay.roomName}, {order.hotelStay.nights} night{order.hotelStay.nights > 1 ? "s" : ""}
            </span>
            <span>{formatPrice(order.hotelStay.nightlyCents * order.hotelStay.rooms * order.hotelStay.nights)}</span>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-black/10 pt-2 font-semibold dark:border-white/10">
          <span>Total</span>
          <span>{formatPrice(order.totalCents)}</span>
        </div>
      </div>
    </div>
  );
}
