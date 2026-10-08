import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { formatPrice } from "@/lib/format";
import { AdminForm } from "@/components/admin-form";
import { createHotel } from "../actions";

export const metadata: Metadata = { title: "Admin · Hotels", robots: { index: false } };

export default async function AdminHotels() {
 await connection();
 await requireAdmin();
 const hotels = await prisma.hotel.findMany({ orderBy: [{ city: "asc" }, { name: "asc" }], include: { roomTypes: { select: { nightlyCents: true } } } });
 return <div className="admin-page">
  <p><Link href="/admin" className="admin-link">← Admin</Link></p>
  <h1>Hotels</h1>
  <p className="admin-note">Hotels whose rooms you&apos;ve contracted. A published hotel is offered with tickets for events in the same city (spell the city exactly as the event listings do, e.g. “Las Vegas”).</p>
  <div className="admin-table-wrap"><table className="admin-table">
   <thead><tr><th>Hotel</th><th>City</th><th>Rooms from</th><th>Status</th><th></th></tr></thead>
   <tbody>{hotels.map(h => <tr key={h.id}>
    <td>{h.name}{h.stars ? ` · ${"★".repeat(h.stars)}` : ""}</td><td>{h.city}</td>
    <td>{h.roomTypes.length ? formatPrice(Math.min(...h.roomTypes.map(r => r.nightlyCents))) + " / night" : "No rooms yet"}</td>
    <td><span className={`admin-status ${h.published ? "s-paid" : "s-pending"}`}>{h.published ? "Published" : "Draft"}</span></td>
    <td><Link className="admin-link" href={`/admin/hotels/${h.id}`}>Manage →</Link></td>
   </tr>)}</tbody>
  </table>{!hotels.length && <p className="admin-note">No hotels yet.</p>}</div>

  <h2>Add a hotel</h2>
  <AdminForm action={createHotel} submit="Create hotel (as draft)" className="admin-grid">
   <label>Name<input name="name" required maxLength={120}/></label>
   <label>City<input name="city" required maxLength={80} placeholder="Las Vegas"/></label>
   <label className="span-2">Street address<input name="address" required maxLength={200}/></label>
   <label>Stars (optional)<select name="stars" defaultValue=""><option value="">—</option>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label>
   <label>Photo URL (https, optional)<input name="imageUrl" type="url" placeholder="https://…"/></label>
   <label className="span-2">Description<textarea name="description" rows={3} maxLength={1000} placeholder="Walk to the venue in 10 minutes. Pool, free Wi-Fi."/></label>
  </AdminForm>
 </div>;
}
