import Stripe from "stripe";

// Null when STRIPE_SECRET_KEY is unset: checkout then falls back to dev mode,
// which confirms orders without payment (development only).
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export const devPaymentsEnabled =
  !stripe && process.env.NODE_ENV !== "production";
