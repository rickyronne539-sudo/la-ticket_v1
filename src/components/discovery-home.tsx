"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import homepage from "@/data/homepage.json";
import { formatPrice } from "@/lib/format";

const imported = new Map([['766720','Oasis'],['734977','Eagles'],['781009','JAY-Z'],['735647','Metallica'],['1173672','Lady A'],['2366444','Harry Styles'],['805983','Brooklyn Nets'],['805946','Golden State Warriors'],['805994','Las Vegas Raiders'],['805966','Miami Heat'],['2336213','Hamilton'],['3552227','The Wizard of Oz at Sphere'],['803682','Dave Chappelle'],['1231400','John Mulaney'],['2431961','Matt Rife'],['1179917','Jo Koy'],['1742147','Disney On Ice'],['806223','Harlem Globetrotters']]);
const cities = ['New York', 'Los Angeles', 'Las Vegas', 'Chicago', 'Atlanta', 'Nashville', 'Denver', 'Miami', 'Sydney', 'Melbourne', 'Brisbane'];
const categories = [{name:'All Events',value:''},{name:'Concerts',value:'CONCERT'},{name:'Sports',value:'SPORTS'},{name:'Arts, Theater & Comedy',value:'ARTS'},{name:'Family',value:'FAMILY'}];
type Card = { title: string; image: string; url: string; genre?: string };
type Event = {
 id: string; slug: string; title: string; startsAt: string; imageUrl: string | null;
 venue: {name:string;city:string;timezone:string}; externalUrl:string|null;
 externalPriceMin:number|null;externalPriceMax:number|null;externalCurrency:string|null;localPrice:number|null;currency:string;bookable:boolean;
};
type Props = {query:string;city:string;date:string;category:string;page:number;searching:boolean;count:number;unavailable:boolean;events:Event[]};
function cardLink(card: Card) {
 const artist = imported.get(card.url.split('/').pop() ?? '');
 return `/?q=${encodeURIComponent(artist ?? card.title)}#results`;
}
function Poster({src,alt,priority=false}:{src:string|null;alt:string;priority?:boolean}) {
 const [failed,setFailed]=useState(false);
 return src && !failed ? <Image src={src} alt={alt} fill unoptimized sizes="(max-width: 600px) 85vw, (max-width: 1000px) 45vw, 25vw" priority={priority} onError={()=>setFailed(true)}/> : <div className="poster-fallback" aria-label={alt}><span>♪</span>Live starts here</div>;
}
function CardRail({cards,label}:{cards:Card[];label:string}) {
 const rail=useRef<HTMLDivElement>(null);
 return <div className="rail-wrap"><div className="event-rail" ref={rail}>{cards.map((card,index)=><Link className="discovery-card" href={cardLink(card)} key={`${card.url}-${index}`}><div className="card-poster"><Poster src={card.image} alt={card.title}/><span className="card-arrow" aria-hidden="true">↗</span></div><p>{card.genre}</p><h3>{card.title}</h3><span className="discovery-ticket-price">View dates and prices</span></Link>)}</div><div className="rail-controls"><button type="button" aria-label={`Previous ${label}`} onClick={()=>rail.current?.scrollBy({left:-rail.current.clientWidth,behavior:'smooth'})}>‹</button><button type="button" aria-label={`More ${label}`} onClick={()=>rail.current?.scrollBy({left:rail.current.clientWidth,behavior:'smooth'})}>›</button></div></div>;
}
const featureNames = ['Eagles','Harry Styles','Oasis','Metallica'];
const features=featureNames.map(name=>homepage.groups[0].cards.find(card=>card.title===name)!);
const featureCopy=['Experience a legendary night at Sphere.','Find your moment. Together, together.','The songs. The crowds. The nights you live for.','Turn it up. Life Burns Faster at Sphere.'];

export function DiscoveryHome(props:Props) {
 const [slide,setSlide]=useState(0);
 const hero=features[slide];
 const linkFor=(changes:Record<string,string>)=>{
  const p=new URLSearchParams({browse:'all',q:props.query,city:props.city,date:props.date,category:props.category,...changes});
  for(const [key,value] of [...p.entries()])if(!value)p.delete(key);
  return `/?${p.toString()}#results`;
 };
 return <div className="discovery-home">
  <section className="search-band" aria-label="Find events">
   <form action="/#results" method="get" className="market-width discovery-search">
    <input type="hidden" name="browse" value="all"/>{props.category&&<input type="hidden" name="category" value={props.category}/>}
    <label className="location-field"><span className="search-symbol" aria-hidden="true">⌖</span><span><span className="field-label">Location</span><input key={props.city} name="city" list="event-cities" defaultValue={props.city} placeholder="City or venue area" autoComplete="address-level2"/></span></label>
    <datalist id="event-cities">{cities.map(city=><option key={city} value={city}/>)}</datalist>
    <label className="date-field"><span className="search-symbol" aria-hidden="true">▦</span><span><span className="field-label">From date</span><input key={props.date} type="date" name="date" defaultValue={props.date} aria-label="Events from date"/></span></label>
    <label className="keyword-field"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg><input key={props.query} name="q" defaultValue={props.query} placeholder="Search by Artist, Event or Venue" aria-label="Artist, event or venue"/></label>
    <button className="search-submit" type="submit">Search <span aria-hidden="true">→</span></button>
   </form>
  </section>
  {props.searching ? <section id="results" className="market-width search-results">
   <div className="results-top"><div><p className="blue-eyebrow">YOUR NEXT LIVE EXPERIENCE</p><h1>{props.query ? `Results for “${props.query}”` : props.city ? `Events in ${props.city}` : categories.find(c=>c.value===props.category)?.name ?? 'All Events'}</h1><p>{props.unavailable?'Listings are temporarily unavailable':`${props.count.toLocaleString()} upcoming events`}{props.date?` from ${props.date}`:''}</p></div><Link href="/" className="browse-link">Back to discovery</Link></div>
   <nav className="category-pills" aria-label="Filter by event category">{categories.map(c=><Link href={linkFor({category:c.value,page:'1'})} key={c.value} aria-current={props.category===c.value?'page':undefined}>{c.name}</Link>)}</nav>
   {props.unavailable ? <div className="catalog-empty"><h2>We couldn&apos;t load the events.</h2><p>Please try again in a moment.</p><button className="ticket-button" onClick={()=>window.location.reload()}>Try again</button></div> : props.events.length===0 ? <div className="catalog-empty"><h2>No matching events</h2><p>Try another artist, city, or date.</p><Link className="ticket-button" href="/?browse=all#results">See all events</Link></div> : <><div className="result-grid">{props.events.map(event=><Link href={`/events/${event.slug}`} key={event.id} className="result-card"><div className="card-poster"><Poster src={event.imageUrl} alt={event.title}/><span className="event-date">{new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:event.venue.timezone}).format(new Date(event.startsAt))}</span></div><div className="result-card-body"><p>{event.venue.city} · {new Intl.DateTimeFormat('en-US',{year:'numeric',hour:'numeric',minute:'2-digit',timeZone:event.venue.timezone}).format(new Date(event.startsAt))}</p><h2>{event.title}</h2><p>{event.venue.name}</p><div className="result-price"><span>{event.localPrice===null?`Prices unavailable`:`From ${formatPrice(event.localPrice, event.currency)}${event.bookable ? " per ticket" : " · Booking unavailable"}`}</span><strong aria-hidden="true">→</strong></div></div></Link>)}</div><nav className="pagination" aria-label="Results pages">{props.page>1&&<Link href={linkFor({page:String(props.page-1)})}>← Previous</Link>}<span>Page {props.page} of {Math.max(1,Math.ceil(props.count/24))}</span>{props.page*24<props.count&&<Link href={linkFor({page:String(props.page+1)})}>Next →</Link>}</nav></>}
  </section> : <>
   <section className="market-width highlights" aria-label="Highlights">
    <div className="home-section-heading"><h1>Highlights</h1><span>Great nights start here.</span></div>
    <div className="feature-hero">
     <div className="feature-art" key={hero.image}><Poster src={hero.image} alt={hero.title} priority/></div><div className="feature-shade"/>
     <div className="feature-copy" aria-live="polite"><span className="feature-label">THE LIVE EXPERIENCE</span><h2>{hero.title}</h2><p>{featureCopy[slide]}<br/><strong>View dates and prices</strong></p><Link href={cardLink(hero)} className="feature-cta">Find Tickets <span aria-hidden="true">→</span></Link></div>
     <div className="feature-navigation"><button aria-label="Previous highlight" onClick={()=>setSlide((slide+features.length-1)%features.length)}>‹</button><span>{slide+1} / {features.length}</span><button aria-label="Next highlight" onClick={()=>setSlide((slide+1)%features.length)}>›</button></div>
    </div>
    <div className="feature-tabs" aria-label="Choose a highlight">{features.map((card,index)=><button key={card.title} aria-pressed={slide===index} onClick={()=>setSlide(index)}><span>0{index+1}</span>{card.title}</button>)}</div>
   </section>
   <div className="market-width discovery-content">
    <div className="popular-heading"><div><span className="blue-eyebrow">FIND YOUR NEXT MOMENT</span><h2>Popular Events</h2></div><Link className="browse-link" href="/?browse=all#results">Explore all events <span aria-hidden="true">→</span></Link></div>
    {homepage.groups.map(group=><section className="category-section" id={group.id} key={group.id}><div className="home-section-heading"><h2>{group.title}</h2><Link className="browse-link" href={`/?category=${group.category}#results`}>See All <span aria-hidden="true">→</span></Link></div><CardRail cards={group.cards} label={group.title}/></section>)}
    <section id="guides" className="guides-section"><div className="home-section-heading"><h2>Entertainment Guides</h2><span>A little inspiration for your next outing.</span></div><div className="guide-grid">{homepage.guides.map(card=><Link href={`/?category=${card.title.includes("Broadway") ? "ARTS" : "SPORTS"}#results`} key={card.title}><div className="card-poster"><Poster src={card.image} alt={card.title}/></div><h3>{card.title} <span aria-hidden="true">→</span></h3></Link>)}</div></section>
    <section className="discover-section"><div className="home-section-heading"><h2>Discover More</h2></div><div className="discover-grid">{homepage.discover.map(card=><a href={card.url} key={card.title} target="_blank" rel="noreferrer"><div className="card-poster"><Poster src={card.image} alt={card.title}/></div><p>{card.genre}</p><h3>{card.title}</h3><span className="browse-link">Read more ↗</span></a>)}</div></section>
    <section id="cities" className="cities-section"><div><p className="blue-eyebrow">A WORLD OF LIVE</p><h2>Find your city.<br/>Find your next memory.</h2></div><div className="city-grid">{cities.map(city=><Link href={`/?city=${encodeURIComponent(city)}#results`} key={city}>{city}<span aria-hidden="true">→</span></Link>)}</div></section>
   </div>
  </>}
  <section id="help" className="market-width home-help"><h2>We&apos;re here to help</h2><details><summary>How do I get tickets?</summary><p>Create an account or sign in, find an event, choose an available ticket type and quantity, and complete payment here. Your order confirmation and tickets are available on your private order page.</p></details><details><summary>Where are the ticket prices?</summary><p>Available ticket prices appear on the event page before checkout. Tickets cost $200 USD each, with unlimited availability. Choose a quantity on the event page to book.</p></details><details><summary>How do I find my local events?</summary><p>Enter your city in the search bar and choose a starting date. Search for a favorite artist, team, or venue, or browse by category.</p></details></section>
 </div>;
}
