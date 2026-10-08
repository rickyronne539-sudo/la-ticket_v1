// LA Tickets' fixed selling price, in USD cents. Hotel stays are priced separately.
export const TICKET_PRICE_CENTS = 20_000;

export const NAIROBI_TEST_SLUG = "nairobi-test-concert";

export function ticketPriceCents(eventSlug: string) {
  return eventSlug === NAIROBI_TEST_SLUG ? 50 : TICKET_PRICE_CENTS;
}
