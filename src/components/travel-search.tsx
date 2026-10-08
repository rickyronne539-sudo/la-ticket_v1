"use client";

import { useState } from "react";
import { hotelSearchUrl } from "@/lib/travel";

const SearchIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg>;
const PinIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg>;

/** The hero search: events (with hotels near them) or straight to hotels in a city. */
export function TravelSearch({ cities }: { cities: string[] }) {
 const [tab, setTab] = useState<"package" | "hotels">("package");
 const [hotelCity, setHotelCity] = useState("");
 return <div className="travel-search">
  <div className="travel-tabs" role="tablist" aria-label="What are you booking?">
   <button role="tab" aria-selected={tab === "package"} onClick={() => setTab("package")}><span aria-hidden="true">🎟</span> Ticket + Hotel</button>
   <button role="tab" aria-selected={tab === "hotels"} onClick={() => setTab("hotels")}><span aria-hidden="true">🛏</span> Hotels Only</button>
  </div>
  {tab === "package" ? (
   <form className="travel-bar" action="/" method="get">
    <input type="hidden" name="browse" value="all"/>
    <label className="travel-field grow"><SearchIcon/><input name="q" placeholder="Search for venues, events, artists or teams" aria-label="Venue, event, artist or team"/></label>
    <label className="travel-field"><PinIcon/><select name="city" aria-label="City" defaultValue=""><option value="">All cities</option>{cities.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
    <button type="submit">Search</button>
   </form>
  ) : (
   <form className="travel-bar" onSubmit={e => { e.preventDefault(); if (hotelCity.trim()) window.open(hotelSearchUrl(hotelCity.trim()), "_blank", "noopener"); }}>
    <label className="travel-field grow"><PinIcon/><input value={hotelCity} onChange={e => setHotelCity(e.target.value)} list="travel-cities" placeholder="Which city are you staying in?" aria-label="City to stay in" required/></label>
    <datalist id="travel-cities">{cities.map(c => <option key={c} value={c}/>)}</datalist>
    <button type="submit">Find hotels ↗</button>
   </form>
  )}
  <ol className="travel-steps">
   <li><span>1</span>Search for your event</li>
   <li><span>2</span>Pick your tickets and a hotel nearby</li>
   <li><span>3</span>Book and enjoy the show</li>
  </ol>
 </div>;
}
