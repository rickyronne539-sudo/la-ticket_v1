import { currentCustomer } from "@/lib/customer";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { EmbeddedPayment } from "@/components/embedded-payment";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Secure checkout", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function CheckoutPage(props: PageProps<"/orders/[id]/checkout">) {
  await connection();
  const { id } = await props.params;
  const { t } = await props.searchParams;
  if (!/^[a-f0-9]{24}$/.test(id) || typeof t !== "string") notFound();
  const order = await prisma.order.findUnique({ where: { id }, include: { event: true } });
  if (!order || order.accessToken !== t) notFound();
  const user = await currentCustomer();
  if (!user) redirect("/account/login");
  if (order.userId !== user.id) notFound();
  const orderPath = `/orders/${order.id}?t=${encodeURIComponent(t)}`;
  if (order.status !== "PENDING") redirect(orderPath);
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!stripe || !key || !order.stripeSessionId) {
    return <div className="mx-auto max-w-xl space-y-4"><h1 className="text-2xl font-bold">Payment unavailable</h1><p>We cannot accept payment right now. No payment has been taken by this page.</p><Link className="ticket-button" href={`/events/${order.event.slug}`}>Back to event</Link></div>;
  }
  const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId).catch(() => null);
  if (!session) return <div role="alert" className="mx-auto max-w-xl space-y-4"><h1 className="text-2xl font-bold">Payment temporarily unavailable</h1><p>Please refresh this page to try again.</p></div>;
  if (session.metadata?.orderId !== order.id) notFound();
  if (session.status === "complete") redirect(orderPath);
  if (session.status === "expired" || order.expiresAt < new Date()) {
    return <div className="mx-auto max-w-xl space-y-4"><h1 className="text-2xl font-bold">Your reservation has expired</h1><p>Please select your tickets again.</p><Link className="ticket-button" href={`/events/${order.event.slug}`}>Choose tickets</Link></div>;
  }
  if (!session.client_secret || session.ui_mode !== "embedded_page") {
    return <div className="mx-auto max-w-xl space-y-4"><h1 className="text-2xl font-bold">Please restart checkout</h1><p>This reservation uses an older checkout format.</p><a className="ticket-button" href={`/api/orders/${id}/cancel?t=${encodeURIComponent(t)}`}>Cancel reservation and start again</a></div>;
  }
  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-sm text-blue-700">LA TICKETS · SECURE CHECKOUT</p><h1 className="text-3xl font-bold">Complete your booking</h1><p className="mt-2">{order.event.title}</p></div><div className="text-right"><p className="text-sm opacity-60">Order total</p><p className="text-2xl font-bold">{formatPrice(order.totalCents)}</p></div></div>
    <p className="text-sm opacity-70">Your tickets are reserved until {order.expiresAt.toLocaleTimeString("en-US", { timeZone: order.event.venue.timezone, hour: "numeric", minute: "2-digit" })} ({order.event.venue.timezone}). Payment is securely processed by Stripe.</p>
    <EmbeddedPayment clientSecret={session.client_secret} publishableKey={key} orderPath={orderPath} />
    <a className="text-sm text-blue-700 underline" href={`/api/orders/${id}/cancel?t=${encodeURIComponent(t)}`}>Cancel and return to event</a>
  </div>;
}
