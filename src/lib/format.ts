export function formatPrice(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code" }).format(cents / 100);
}

export function formatDate(date: Date, timeZone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

export const categoryLabels = {
  CONCERT: "Concerts",
  THEATRE: "Theatre",
  ARTS: "Arts & Culture",
  FAMILY: "Family",
  NIGHTLIFE: "Nightlife",
  SPORTS: "Sports",
} as const;

export function formatExternalPrice(event: { externalPriceMin: number | null; externalPriceMax: number | null; externalCurrency: string | null }) {
  if (event.externalPriceMin == null || !event.externalCurrency) return "Check price on Ticketmaster";
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: event.externalCurrency, currencyDisplay: "code" });
  const min = money.format(event.externalPriceMin);
  return event.externalPriceMax != null && event.externalPriceMax > event.externalPriceMin
    ? `${min} – ${money.format(event.externalPriceMax)}` : `From ${min}`;
}
