// Hotel search is handed to Google Maps: this site sells event tickets, not rooms,
// so it never shows hotel prices it can't stand behind.
export function hotelSearchUrl(place: string) {
 return `https://www.google.com/maps/search/${encodeURIComponent(`hotels near ${place}`)}`;
}

export type PackageBadge = "THIS WEEK" | "MULTIPLE DATES" | "TICKET + HOTEL" | "TICKETS HERE";

const DAY = 24 * 60 * 60 * 1000;

/**
 * A badge from facts about the listing, so it is never just decoration. (No
 * "just announced": imported events carry the import date, not the on-sale date.)
 */
export function packageBadge(firstDate: Date, dates: number, sale: "package" | "tickets" | "external", now = new Date()): PackageBadge {
 if (sale === "package") return "TICKET + HOTEL";
 if (firstDate.getTime() - now.getTime() <= 7 * DAY) return "THIS WEEK";
 if (sale === "tickets") return "TICKETS HERE";
 return dates > 1 ? "MULTIPLE DATES" : "THIS WEEK";
}
