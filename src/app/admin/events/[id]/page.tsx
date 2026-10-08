import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { formatDate, formatPrice } from "@/lib/format";
import { AdminForm } from "@/components/admin-form";
import { addTicketType, adjustTickets } from "../../actions";

export const metadata: Metadata = { title: "Admin · Event tickets", robots: { index: false } };

export default async function AdminEventTickets(props: PageProps<"/admin/events/[id]">) {
 await connection();
 await requireAdmin();
 const { id } = await props.params;
 if (!/^[a-f0-9]{24}$/.test(id)) notFound();
 const event = await prisma.event.findUnique({ where: { id }, include: { ticketTypes: { orderBy: { priceCents: "asc" } } } });
 if (!event) notFound();
 const hotels = await prisma.hotel.count({ where: { published: true, city: { equals: event.venue.city, mode: "insensitive" } } });
 return <div className="admin-page">
  <p><Link href="/admin/events" className="admin-link">← Events</Link></p>
  <h1>{event.title}</h1>
  <p className="admin-note">{formatDate(event.startsAt, event.venue.timezone)} · {event.venue.name}, {event.venue.city} · <Link className="admin-link" href={`/events/${event.slug}`}>View public page ↗</Link></p>
  <p className="admin-note">{hotels ? `${hotels} published hotel${hotels > 1 ? "s" : ""} in ${event.venue.city}: customers can add a stay.` : `No published hotels in ${event.venue.city} yet, so this sells as tickets only.`}</p>

  <h2>Ticket types</h2><p className="admin-note">Enter base prices in USD. Australian events automatically convert to AUD for customers and checkout.</p>
  {event.ticketTypes.length ? <div className="admin-table-wrap"><table className="admin-table">
   <thead><tr><th>Type</th><th>Price</th><th>Left / total</th><th>Change</th></tr></thead>
   <tbody>{event.ticketTypes.map(t => <tr key={t.id}>
    <td>{t.name}<br/><small>max {t.maxPerOrder} per order</small></td>
    <td>{formatPrice(t.priceCents)}</td>
    <td>{t.unlimited ? "Unlimited" : `${t.available} / ${t.capacity}`}</td>
    <td>{t.unlimited ? "Unlimited availability" : <form action={adjustTickets} className="admin-inline">
     <input type="hidden" name="ticketTypeId" value={t.id}/>
     <label>Add or remove<input name="change" type="number" step="1" defaultValue={0} aria-label={`Tickets to add to ${t.name}`}/></label>
     <label>Base price (USD)<input name="price" type="number" step="0.01" min="0" defaultValue={(t.priceCents / 100).toFixed(2)} aria-label={`Price of ${t.name}`}/></label>
     <button>Update</button>
    </form>}</td>
   </tr>)}</tbody>
  </table></div> : <p className="admin-note">No tickets yet: on-site booking remains unavailable until you add confirmed prices and inventory.</p>}

  <h2>Add a ticket type</h2>
  <AdminForm action={addTicketType} submit="Add tickets" className="admin-grid">
   <input type="hidden" name="eventId" value={event.id}/>
   <label>Name<input name="name" required placeholder="General Admission" maxLength={80}/></label>
   <label>Base price (USD)<input name="price" type="number" step="0.01" min="0" defaultValue="200.00" required/></label>
   <label>How many<input name="capacity" type="number" min="1" step="1" required/></label>
   <label>Max per order<input name="maxPerOrder" type="number" min="1" max="20" defaultValue={8}/></label>
  </AdminForm>
 </div>;
}
