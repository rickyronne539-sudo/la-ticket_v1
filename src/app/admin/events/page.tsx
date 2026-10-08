import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Admin · Events", robots: { index: false } };

export default async function AdminEvents(props: PageProps<"/admin/events">) {
 await connection();
 await requireAdmin();
 const { q } = await props.searchParams;
 const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
 const events = await prisma.event.findMany({
  where: { startsAt: { gte: new Date() }, ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { venue: { is: { city: { contains: query, mode: "insensitive" } } } }] } : { ticketTypes: { some: {} } }) },
  orderBy: { startsAt: "asc" },
  take: 60,
  include: { ticketTypes: { select: { available: true, capacity: true, unlimited: true } } },
 });
 return <div className="admin-page">
  <p><Link href="/admin" className="admin-link">← Admin</Link></p>
  <h1>Your ticket inventory</h1>
  <p className="admin-note">Find an event and add the tickets you hold for it. Once it has tickets, customers buy them here (with a hotel if you have one in that city) through on-site checkout. Only add tickets you actually have the right to sell.</p>
  <form className="admin-search"><input name="q" defaultValue={query} placeholder="Search events by name or city" aria-label="Search events"/><button>Search</button></form>
  <h2>{query ? `Events matching “${query}”` : "Events you sell"}</h2>
  <div className="admin-table-wrap"><table className="admin-table">
   <thead><tr><th>Date</th><th>Event</th><th>City</th><th>Your tickets</th><th></th></tr></thead>
   <tbody>{events.map(e => {
    const unlimited = e.ticketTypes.some(t => t.unlimited);
    const left = e.ticketTypes.reduce((s, t) => s + t.available, 0), total = e.ticketTypes.reduce((s, t) => s + t.capacity, 0);
    return <tr key={e.id}><td>{e.startsAt.toISOString().slice(0, 10)}</td><td>{e.title}</td><td>{e.venue.city}</td><td>{unlimited ? "Unlimited" : total ? `${left} of ${total} left` : "—"}</td><td><Link className="admin-link" href={`/admin/events/${e.id}`}>{unlimited || total ? "Manage" : "Add tickets"} →</Link></td></tr>;
   })}</tbody>
  </table>{!events.length && <p className="admin-note">{query ? "No upcoming events match." : "You aren't selling any events yet. Search above to add tickets."}</p>}</div>
 </div>;
}
