"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe, type StripeEmbeddedCheckout } from "@stripe/stripe-js";

export function EmbeddedPayment({ clientSecret, publishableKey, orderPath }: { clientSecret: string; publishableKey: string; orderPath: string }) {
  const mount = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let checkout: StripeEmbeddedCheckout | undefined;
    async function initialize() {
      const stripe = await loadStripe(publishableKey);
      if (!stripe) throw new Error("The secure payment form could not load.");
      if (disposed) return;
      const instance = await stripe.createEmbeddedCheckoutPage({
        fetchClientSecret: async () => clientSecret,
        onComplete: () => { window.location.assign(orderPath); },
      });
      if (disposed) { instance.destroy(); return; }
      checkout = instance;
      if (mount.current) instance.mount(mount.current);
    }
    initialize().catch(() => { if (!disposed) setError("The payment form could not load. Refresh this page to try again."); });
    return () => { disposed = true; checkout?.destroy(); };
  }, [clientSecret, publishableKey, orderPath]);
  return <div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
    <div ref={mount} className="min-h-80" aria-label="Secure payment form" />
  </div>;
}
