import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eventCurrency, type Currency } from "./pricing";

type Rate = { currency: Currency; exchangeRate: number; rateDate: string };
type QuoteEvent = { id: string; slug: string; venue: { country?: string | null; timezone?: string }; ticketTypes: { id: string; priceCents: number }[] };
const QUOTE_MS = 30 * 60 * 1000;

export async function exchangeRateFor(currency: Currency): Promise<Rate> {
  if (currency === "USD") return { currency, exchangeRate: 1, rateDate: "" };
  const response = await fetch("https://api.frankfurter.dev/v2/rate/USD/AUD", {
    next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Exchange rates are temporarily unavailable.");
  const data = await response.json();
  const age = Date.now() - Date.parse(data.date);
  if (data.base !== "USD" || data.quote !== "AUD" || !Number.isFinite(data.rate) || data.rate <= 0 ||
      !Number.isFinite(age) || age < -86400000 || age > 7 * 86400000) {
    throw new Error("A current AUD exchange rate is unavailable.");
  }
  return { currency, exchangeRate: data.rate, rateDate: data.date };
}

function fingerprint(event: QuoteEvent) {
  return JSON.stringify([event.id, event.slug, event.ticketTypes.map(t => [t.id, t.priceCents]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
}

function sign(payload: string) {
  const secret = process.env.TICKET_SECRET;
  if (!secret) throw new Error("Pricing is temporarily unavailable.");
  return createHmac("sha256", secret).update(`currency-quote:${payload}`).digest("hex");
}

export async function createPriceQuote(event: QuoteEvent) {
  const rate = await exchangeRateFor(eventCurrency(event.venue));
  const payload = Buffer.from(JSON.stringify({ ...rate, event: fingerprint(event), expiresAt: Date.now() + QUOTE_MS })).toString("base64url");
  return { ...rate, token: `${payload}.${sign(payload)}` };
}

// The displayed rate is signed and bound to the event/prices; never trust a browser rate.
export function verifyPriceQuote(token: string | undefined, event: QuoteEvent): Rate {
  const currency = eventCurrency(event.venue);
  // Allows pre-existing USD forms and internal booking callers to continue working.
  if (!token && currency === "USD") return { currency, exchangeRate: 1, rateDate: "" };
  try {
    if (!token || token.length > 20000) throw new Error();
    const [payload, signature, extra] = token.split(".");
    const expected = sign(payload);
    if (extra || !/^[a-f0-9]{64}$/.test(signature ?? "") || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error();
    const quote = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (quote.event !== fingerprint(event) || quote.currency !== currency ||
        !Number.isFinite(quote.expiresAt) || quote.expiresAt <= Date.now() || quote.expiresAt > Date.now() + QUOTE_MS ||
        !Number.isFinite(quote.exchangeRate) || quote.exchangeRate <= 0 || (currency === "USD" && quote.exchangeRate !== 1)) throw new Error();
    return { currency, exchangeRate: quote.exchangeRate, rateDate: quote.rateDate };
  } catch {
    throw new Error("Your price quote expired or changed. Refresh the event page and try again.");
  }
}
