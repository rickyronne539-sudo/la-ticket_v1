import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Live Event Tickets | LA Tickets", template: "%s | LA Tickets" },
  description: "Discover live events and book available tickets directly with LA Tickets.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <SiteHeader />
        <main id="main-content" className="app-main">{children}</main>
        <footer className="market-footer">
          <div className="market-width footer-columns">
            <div><Link href="/" className="market-brand">la<span>tickets</span></Link><p>Live is where it happens.</p><p>Discover your next unforgettable moment.</p></div>
            <div><h2>Helpful Links</h2><Link href="/#help">Help & FAQs</Link><Link href="/?browse=all#results">Find Tickets</Link><Link href="/travel">Tickets + Hotels</Link></div>
            <div><h2>Explore</h2><Link href="/?category=CONCERT#results">Concerts</Link><Link href="/?category=SPORTS#results">Sports</Link><Link href="/?category=ARTS#results">Arts, Theater & Comedy</Link><Link href="/?category=FAMILY#results">Family</Link></div>
            <div><h2>Discover More</h2><Link href="/#guides">Entertainment Guides</Link><Link href="/#cities">Popular Cities</Link><Link href="/travel">Travel: Tickets + Hotels</Link><Link href="/?browse=all#results">Browse Events</Link></div>
          </div>
          <div className="market-width footer-legal"><span>© {new Date().getFullYear()} LA Tickets</span><span>Independent ticketing site · Book with LA Tickets</span></div>
        </footer>
      </body>
    </html>
  );
}
