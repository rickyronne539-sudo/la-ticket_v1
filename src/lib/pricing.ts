// Default base price for new catalog tickets, in USD cents.
export const TICKET_PRICE_CENTS = 20_000;

// Catalog ticket and hotel prices are USD base cents; order amounts use order.currency.
export function ticketPriceCents(storedPrice = TICKET_PRICE_CENTS) {
  return storedPrice;
}

export type Currency = "USD" | "AUD";
export function eventCurrency(venue: { country?: string | null; timezone?: string }): Currency {
  const country = venue.country?.trim().toUpperCase();
  if (["AU", "AUS", "AUSTRALIA"].includes(country ?? "")) return "AUD";
  if (["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(country ?? "")) return "USD";
  return venue.timezone?.startsWith("Australia/") ? "AUD" : "USD";
}

export function convertCents(usdCents: number, exchangeRate: number) {
  if (!Number.isSafeInteger(usdCents) || usdCents < 0 || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error("Invalid price or exchange rate.");
  }
  const cents = Math.round(usdCents * exchangeRate);
  if (!Number.isSafeInteger(cents)) throw new Error("Price is too large.");
  return cents;
}
