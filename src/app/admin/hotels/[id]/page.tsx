import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { formatPrice } from "@/lib/format";
import { addDays } from "@/lib/hotels";
import { AdminForm } from "@/components/admin-form";
import { addRoomType, setAvailability, updateHotel, updateRoomPrice } from "../../actions";

export const metadata: Metadata = { title: "Admin · Hotel", robots: { index: false } };
const DAYS = 21;

export default async function AdminHotel(props: PageProps<"/admin/hotels/[id]">) {
 await connection();
 await requireAdmin();
 const { id } = await props.params;
 if (!/^[a-f0-9]{24}$/.test(id)) notFound();
 const today = new Date().toISOString().slice(0, 10);
 const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
 const hotel = await prisma.hotel.findUnique({
  where: { id },
  include: { roomTypes: { orderBy: { nightlyCents: "asc" }, include: { nights: { where: { date: { gte: days[0], lte: days[DAYS - 1] } } } } } },
 });
 if (!hotel) notFound();
 const events = await prisma.event.count({ where: { startsAt: { gte: new Date() }, venue: { is: { city: { equals: hotel.city, mode: "insensitive" } } }, ticketTypes: { some: { available: { gt: 0 } } } } });

 return <div className="admin-page">
  <p><Link href="/admin/hotels" className="admin-link">← Hotels</Link></p>
  <h1>{hotel.name}</h1>
  <p className="admin-note">{events ? `Offered with ${events} upcoming event${events > 1 ? "s" : ""} you sell in ${hotel.city}.` : `You aren't selling tickets for any upcoming event in ${hotel.city} yet, so customers won't see this hotel until you do.`}</p>

  <h2>Details</h2>
  <AdminForm action={updateHotel} submit="Save details" className="admin-grid">
   <input type="hidden" name="hotelId" value={hotel.id}/>
   <label>Name<input name="name" required defaultValue={hotel.name}/></label>
   <label>City<input name="city" required defaultValue={hotel.city}/></label>
   <label className="span-2">Street address<input name="address" required defaultValue={hotel.address}/></label>
   <label>Stars<select name="stars" defaultValue={hotel.stars ?? ""}><option value="">—</option>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label>
   <label>Photo URL<input name="imageUrl" type="url" defaultValue={hotel.imageUrl ?? ""}/></label>
   <label className="span-2">Description<textarea name="description" rows={3} defaultValue={hotel.description}/></label>
   <label className="span-2 admin-check"><input type="checkbox" name="published" defaultChecked={hotel.published}/> Published (offered to customers)</label>
  </AdminForm>

  <h2>Rooms for sale, next {DAYS} nights</h2>
  {hotel.roomTypes.length ? <div className="admin-table-wrap"><table className="admin-table admin-calendar">
   <thead><tr><th>Room</th>{days.map(d => <th key={d}>{d.slice(5)}</th>)}</tr></thead>
   <tbody>{hotel.roomTypes.map(r => {
    const left = new Map(r.nights.map(n => [n.date, n.available]));
    return <tr key={r.id}>
     <td><strong>{r.name}</strong><br/><small>sleeps {r.sleeps} · max {r.maxRooms}/order</small>
      <form action={updateRoomPrice} className="admin-inline"><input type="hidden" name="roomTypeId" value={r.id}/><label>$/night<input name="price" type="number" step="0.01" min="1" defaultValue={(r.nightlyCents / 100).toFixed(2)}/></label><button>Save</button></form>
     </td>
     {days.map(d => <td key={d} className={!left.has(d) ? "c-none" : left.get(d)! > 0 ? "c-open" : "c-full"}>{left.get(d) ?? "–"}</td>)}
    </tr>;
   })}</tbody>
  </table></div> : <p className="admin-note">Add a room type below, then set how many rooms you have each night.</p>}

  {hotel.roomTypes.length > 0 && <>
   <h2>Set rooms for sale</h2>
   <p className="admin-note">Sets the number of rooms still for sale on each night in the range (rooms already sold aren&apos;t counted). Use 0 to stop selling a night.</p>
   <AdminForm action={setAvailability} submit="Set availability" className="admin-grid">
    <label>Room type<select name="roomTypeId">{hotel.roomTypes.map(r => <option key={r.id} value={r.id}>{r.name} ({formatPrice(r.nightlyCents)}/night)</option>)}</select></label>
    <label>Rooms per night<input name="rooms" type="number" min="0" max="500" required defaultValue={5}/></label>
    <label>First night<input name="from" type="date" required min={today} defaultValue={today}/></label>
    <label>Last night<input name="to" type="date" required min={today} defaultValue={addDays(today, 30)}/></label>
   </AdminForm>
  </>}

  <h2>Add a room type</h2>
  <AdminForm action={addRoomType} submit="Add room type" className="admin-grid">
   <input type="hidden" name="hotelId" value={hotel.id}/>
   <label>Name<input name="name" required placeholder="Deluxe King" maxLength={80}/></label>
   <label>Price per night ($)<input name="price" type="number" step="0.01" min="1" required/></label>
   <label>Sleeps<input name="sleeps" type="number" min="1" max="12" defaultValue={2}/></label>
   <label>Max rooms per order<input name="maxRooms" type="number" min="1" max="10" defaultValue={4}/></label>
  </AdminForm>
 </div>;
}
