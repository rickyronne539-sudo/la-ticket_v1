import { redirect } from "next/navigation";
import { releaseOrder } from "@/lib/booking";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";

// Stripe's cancel_url: the buyer backed out, so give the tickets back right away
// instead of waiting for the hold to expire.
export async function GET(request: Request, ctx: RouteContext<"/api/orders/[id]/cancel">) {
  const { id } = await ctx.params;
  const token = new URL(request.url).searchParams.get("t");
  const order = /^[a-f0-9]{24}$/.test(id)
    ? await prisma.order.findUnique({ where: { id }, include: { event: true } })
    : null;
  if (!order || !token || order.accessToken !== token) return new Response("Not found", { status: 404 });

  if (order.status === "PENDING") {
    if (stripe && order.stripeSessionId) {
      // Expire the session first so it can't be paid after the tickets are released.
      // Throws if it was already completed, in which case the webhook will confirm the order.
      try {
        await stripe.checkout.sessions.expire(order.stripeSessionId);
        await releaseOrder(order.id);
      } catch {}
    } else {
      await releaseOrder(order.id);
    }
  }

  redirect(`/events/${order.event.slug}?cancelled=1`);
}
