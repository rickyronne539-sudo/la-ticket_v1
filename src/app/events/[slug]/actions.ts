"use server";

import { currentCustomer } from "@/lib/customer";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BookingError, createHold, releaseOrder } from "@/lib/booking";
import { prisma } from "@/lib/db";
import { expireStaleOrders } from "@/lib/payments";
import { livePaymentsConfigured, stripe } from "@/lib/stripe";

export type CheckoutState = { error?: string };

const checkoutSchema = z.object({
  priceQuote: z.string().max(20000).optional(),
  eventId: z.string().regex(/^[a-f0-9]{24}$/),
  email: z.email("Enter a valid email address."),
  items: z
    .array(z.object({ ticketTypeId: z.string().regex(/^[a-f0-9]{24}$/), quantity: z.coerce.number().int().min(0).max(20) }))
    .min(1),
  // Present only for a ticket + hotel package.
  stay: z
    .object({
      roomTypeId: z.string().regex(/^[a-f0-9]{24}$/),
      checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a check-in date."),
      checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a check-out date."),
      rooms: z.coerce.number().int().min(1).max(10),
      guestName: z.string().trim().min(2, "Enter the name for the hotel booking.").max(120),
    })
    .nullable(),
});

export async function startCheckout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const user = await currentCustomer();
  if (!user) return { error: "Create an account or sign in before booking." };
  const ticketTypeIds = formData.getAll("ticketTypeId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const parsed = checkoutSchema.safeParse({
    eventId: formData.get("eventId"),
    priceQuote: formData.get("priceQuote") || undefined,
    email: user.email,
    items: ticketTypeIds.map((ticketTypeId, i) => ({ ticketTypeId, quantity: quantities[i] })),
    stay: formData.get("roomTypeId")
      ? {
          roomTypeId: formData.get("roomTypeId"),
          checkIn: formData.get("checkIn"),
          checkOut: formData.get("checkOut"),
          rooms: formData.get("rooms"),
          guestName: formData.get("guestName"),
        }
      : null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request." };

  if (!stripe || !livePaymentsConfigured) return { error: "Live payments are temporarily unavailable. Please try again later." };

  // Free up abandoned holds before reserving, so inventory isn't stuck waiting on the cron.
  await expireStaleOrders();

  let order;
  try {
    order = await createHold({ ...parsed.data, userId: user.id });
  } catch (err) {
    if (err instanceof BookingError) return { error: err.message };
    throw err;
  }

  if (order.totalCents <= 0) {
    await releaseOrder(order.id);
    return { error: "This booking does not have a valid paid ticket price." };
  }

  const checkoutUrl = `/orders/${order.id}/checkout?t=${encodeURIComponent(order.accessToken)}`;
  let sessionId: string | undefined;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded_page",
      redirect_on_completion: "never",
      payment_method_types: ["card"],
      customer_email: order.email,
      payment_intent_data: { receipt_email: order.email, description: `LA Tickets booking ${order.id}: ${order.event.title}` },
      line_items: [
        ...order.items.filter((item) => item.quantity > 0).map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: order.currency.toLowerCase(),
            unit_amount: item.priceCents,
            product_data: { name: `${order.event.title} — ${item.name}` },
          },
        })),
        // The hotel is one line: price per room-night, times rooms × nights.
        ...(order.hotelStay
          ? [{
              quantity: order.hotelStay.rooms * order.hotelStay.nights,
              price_data: {
                currency: order.currency.toLowerCase(),
                unit_amount: order.hotelStay.nightlyCents,
                product_data: {
                  name: `${order.hotelStay.hotelName} — ${order.hotelStay.roomName}`,
                  description: `${order.hotelStay.rooms} room${order.hotelStay.rooms > 1 ? "s" : ""} × ${order.hotelStay.nights} night${order.hotelStay.nights > 1 ? "s" : ""}, ${order.hotelStay.checkIn} to ${order.hotelStay.checkOut}`,
                },
              },
            }]
          : []),
      ],
      metadata: { orderId: order.id },
      expires_at: Math.floor(order.expiresAt.getTime() / 1000),

    });
    sessionId = session.id;
    if (!session.client_secret) throw new Error("Embedded checkout did not return a client secret.");
    await prisma.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
  } catch (err) {
    if (sessionId) {
      try { await stripe.checkout.sessions.expire(sessionId); }
      catch { return { error: "We could not finish opening checkout. Your reservation will expire automatically." }; }
    }
    await releaseOrder(order.id);
    console.error("Stripe checkout failed", err instanceof Error ? err.name : "Unknown error");
    return { error: "Could not start payment. Please try again." };
  }

  redirect(checkoutUrl);
}
