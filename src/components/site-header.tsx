"use client";

import Link from "next/link";
import { useState } from "react";

export function SiteHeader() {
 const [open, setOpen] = useState(false);
 return <header className="market-header">
  <div className="market-utility"><div className="market-width"><span>🇺🇸 &nbsp; United States</span><div><Link href="/travel">Travel + Hotels</Link><Link href="/?browse=all#results">Find Tickets</Link><Link href="/#help">Help</Link></div></div></div>
  <nav className="market-width market-nav" aria-label="Main navigation">
   <button className="menu-toggle" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "×" : "☰"}</button>
   <Link className="market-brand" href="/" aria-label="LA Tickets home">la<span>tickets</span></Link>
   <div className={`market-links ${open ? "is-open" : ""}`} onClick={() => setOpen(false)}><Link href="/?category=CONCERT#results">Concerts</Link><Link href="/?category=SPORTS#results">Sports</Link><Link href="/?category=ARTS#results">Arts, Theater & Comedy</Link><Link href="/?category=FAMILY#results">Family</Link><Link href="/#cities">Cities</Link><Link href="/travel">Travel</Link></div>
   <Link className="account-link" href="/account"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg><span>My account</span></Link>
  </nav>
 </header>;
}
