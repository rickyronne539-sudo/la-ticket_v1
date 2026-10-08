import type Stripe from "stripe";
import { settleCheckoutSession } from "@/lib/payments";
import { stripe } from "@/lib/stripe";

// Optional. Orders are also confirmed by asking Stripe directly (src/lib/payments.ts);
// the webhook just makes confirmation instant even if the buyer closes the tab.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!stripe || !secret || !signature) return new Response("Not configured", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired") {
    await settleCheckoutSession(event.data.object as Stripe.Checkout.Session);
  }

  return Response.json({ received: true });
}
