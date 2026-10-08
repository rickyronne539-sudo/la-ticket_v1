import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { formatPrice } from "@/lib/format";
import { stayTotal } from "@/lib/hotels";
import { logout } from "./actions";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminHome() {
 await connection();
 await requireAdmin();
 const [sellable, hotels, orders] = await Promise.all([
  prisma.event.count({ where: { startsAt: { gte: new Date() }, ticketTypes: { some: {} } } }),
  prisma.hotel.count(),
  prisma.order.findMany({ where: { status: { in: ["PAID", "PENDING", "REFUNDED"] } }, orderBy: { createdAt: "desc" }, take: 50, include: { event: { select: { title: true, startsAt: true, venue: true } } } }),
 ]);
 return <div className="admin-page">
  <div className="admin-top"><h1>Admin</h1><form action={logout}><button className="admin-link">Sign out</button></form></div>
  <div className="admin-cards">
   <Link href="/admin/events"><strong>{sellable}</strong> upcoming events you sell<span>Add your ticket inventory →</span></Link>
   <Link href="/admin/hotels"><strong>{hotels}</strong> hotels<span>Rooms, prices and availability →</span></Link>
  </div>
  <h2>Recent orders</h2>
  <p className="admin-note">Paid hotel stays are yours to pass to the hotel: send them the guest name, dates and room type.</p>
  <div className="admin-table-wrap"><table className="admin-table">
   <thead><tr><th>When</th><th>Status</th><th>Event</th><th>Customer</th><th>Hotel stay</th><th>Total</th></tr></thead>
   <tbody>{orders.map(o => <tr key={o.id}>
    <td>{o.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
    <td><span className={`admin-status s-${o.status.toLowerCase()}`}>{o.status}</span></td>
    <td>{o.event.title}<br/><small>{o.event.venue.city} · {o.event.startsAt.toISOString().slice(0, 10)}</small></td>
    <td>{o.email}</td>
    <td>{o.hotelStay ? <>{o.hotelStay.hotelName} · {o.hotelStay.roomName}<br/><small>{o.hotelStay.guestName} · {o.hotelStay.checkIn} → {o.hotelStay.checkOut} · {o.hotelStay.rooms} room{o.hotelStay.rooms > 1 ? "s" : ""} · {formatPrice(stayTotal(o.hotelStay), o.currency)}</small></> : <small>Tickets only</small>}</td>
    <td>{formatPrice(o.totalCents, o.currency)}</td>
   </tr>)}</tbody>
  </table>{!orders.length && <p className="admin-note">No orders yet.</p>}</div>
 </div>;
}
