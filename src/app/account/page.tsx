import Link from "next/link";
import { redirect } from "next/navigation";
import { currentCustomer } from "@/lib/customer";
import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { syncPendingOrders } from "@/lib/payments";
import { signOut } from "./actions";
export default async function Account() {
  const user = await currentCustomer();
  if (!user) redirect("/account/login");
  await syncPendingOrders(user.id);
  const orders = await prisma.order.findMany({ where: { userId: user.id }, include: { event: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return <div className="mx-auto max-w-3xl space-y-6"><h1 className="text-3xl font-bold">My bookings</h1><p>{user.email}</p><form action={signOut}><button className="underline">Sign out</button></form>{orders.length ? orders.map(order => <Link className="block rounded border p-4" key={order.id} href={`/orders/${order.id}?t=${encodeURIComponent(order.accessToken)}`}><strong>{order.event.title}</strong><p>{formatPrice(order.totalCents, order.currency)} · {order.status}</p></Link>) : <p>No bookings yet. <Link className="underline" href="/?browse=all#results">Find an event</Link></p>}</div>;
}
