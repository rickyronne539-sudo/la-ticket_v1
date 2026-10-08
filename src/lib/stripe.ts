import Stripe from "stripe";

// Real payments only. Missing/test keys fail closed.
const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
export const stripe = /^(sk|rk)_live_/.test(secretKey)
  ? new Stripe(secretKey)
  : null;

export const livePaymentsConfigured =
  !!stripe && !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_");
