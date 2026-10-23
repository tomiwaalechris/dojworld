"use client";

/* Original photography sourced from the public Dojworld website for this rebuild. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { HotelHeroPhotos, RoomPhotoGallery } from "@/components/hotel-photo-gallery";
import { OnlineCheckout } from "@/components/online-checkout";
import { useAvailability } from "@/lib/booking/use-availability";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, MapPin, Menu, X, Wifi, Wind, Zap, ShieldCheck, Coffee, Tv, Utensils, Phone, Mail, Check, MessageCircle, CalendarDays } from "lucide-react";
import { rooms, money, roomSlug, galleryPhotos, type DojRoom } from "@/lib/dojworld";
import { enhanceSiteMotion, scrollToHotelSection } from "@/lib/site-motion";
import "@/app/dojworld.css";

export type WebsitePage = "home" | "about" | "rooms" | "experience" | "gallery" | "contact" | "room";

export function DojworldWebsite({ page = "home", room }: { page?: WebsitePage; room?: DojRoom }) {
  const [galleryCategory, setGalleryCategory] = useState("All");
  const [menu, setMenu] = useState(false);
  const [category, setCategory] = useState("All rooms");
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [guests, setGuests] = useState("2");
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<DojRoom | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const site = useRef<HTMLDivElement>(null);
  const [today, setToday] = useState("");
  useEffect(() => {
    if (site.current) return enhanceSiteMotion(site.current);
  }, [page, category, galleryCategory]);
  useEffect(() => { setToday(new Intl.DateTimeFormat("en-CA", {timeZone:"Africa/Lagos",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())); }, []);
  const nights = arrival && departure ? Math.round((Date.parse(departure)-Date.parse(arrival))/86400000) : 0;
  useEffect(() => {
    if (selected || photo) { dialog.current?.showModal(); document.body.style.overflow="hidden"; }
    else { dialog.current?.close(); document.body.style.overflow=""; }
    return () => { document.body.style.overflow=""; };
  }, [selected, photo]);
  function close() { setSelected(null); setPhoto(null);  }
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (page !== "rooms") {
      window.location.assign(`/rooms?${new URLSearchParams({ arrival, departure, guests, ...(category !== "All rooms" ? { roomType: category } : {}) })}#rooms`);
      return;
    }
    setSearched(true);
    scrollToHotelSection("rooms");
  }
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const start = query.get("arrival") ?? "";
    const end = query.get("departure") ?? "";
    const roomType = query.get("roomType");
    if (roomType && ["Standard","Deluxe","Royalty","Executive"].includes(roomType)) setCategory(roomType);
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
    if (validDate(start) && validDate(end) && end > start) {
      setArrival(start); setDeparture(end); setSearched(true);
      setGuests(query.get("guests") === "1" ? "1" : "2");
    }
  }, []);
  const stayQuery = arrival && departure ? `?${new URLSearchParams({ arrival, departure, guests })}` : "";
  const pageTitles = { home: "Welcome", about: "Our story", rooms: "Rooms & suites", experience: "The experience", gallery: "Photo gallery", contact: "Contact us", room: room?.name ?? "Your room" };
  const pageIntros = {
    home: "", about: "A warm welcome in the heart of Ikeja. Discover the people, comforts and hospitality behind your stay.",
    rooms: "Seven distinctive rooms. Four room categories. Find your own space to unwind at DOJ World Suites.",
    experience: "From breakfast to a drink at the bar, discover the comforts that make your stay feel effortless.",
    gallery: "Explore our rooms, facilities, restaurant and bar through photographs from DOJ World Suites.",
    contact: "Planning a stay or have a question? Our hotel is open 24 hours a day, seven days a week.", room: ""
  };
  function choose(room: DojRoom) {  setSelected(room); }
  const availability = useAvailability(arrival,departure,guests);

  return <div ref={site} className={`doj-site${page === "home" ? " doj-site--home" : ""}`}>
    <a className="doj-skip" href="#main">Skip to content</a>
    <div className="doj-topline"><span><MapPin size={12}/> IKEJA, LAGOS, NIGERIA</span><a href="tel:+2349133898066">Your stay starts here <span>+234 913 389 8066</span><ArrowUpRight size={12}/></a></div>
    <header className="doj-header">
      <Link href="/" className="doj-wordmark" aria-label="Dojworld Suites home"><img src="/dojworld/logo.png" alt=""/><span>DOJ WORLD<small>SUITES · IKEJA</small></span></Link>
      <nav aria-label="Main navigation" className={menu ? "doj-nav is-open" : "doj-nav"}>{[["Home","/"],["Our story","/about"],["Rooms & suites","/rooms"],["The experience","/experience"],["Gallery","/gallery"],["Contact","/contact"]].map(([label,href])=><Link key={href} href={href} aria-current={(href === "/" ? page === "home" : href === `/${page}` || (page === "room" && href === "/rooms")) ? "page" : undefined} onClick={()=>setMenu(false)}>{label}</Link>)}</nav>
      <Link href="/rooms#booking" className="doj-btn doj-header-book">Plan your stay <ArrowUpRight size={15}/></Link><button className="doj-menu" aria-label={menu?"Close navigation":"Open navigation"} aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button>
    </header>
    <main id="main">
      {page !== "home" && <section className="doj-page-heading"><nav aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span>{page === "room" && <><Link href="/rooms">Rooms & suites</Link><span>/</span></>}<span>{pageTitles[page]}</span></nav><span className="doj-kicker">DOJ WORLD SUITES · IKEJA, LAGOS</span><h1>{pageTitles[page]}</h1>{pageIntros[page] && <p>{pageIntros[page]}</p>}</section>}
      {page === "room" && room && <section className="doj-room-detail doj-section"><RoomPhotoGallery key={room.name} name={room.name} photos={[room.image, ...room.photos]}/><div><span className="doj-kicker">{room.category} ROOM</span><h2>Your own little escape.</h2><p>{room.description}</p><div className="doj-dialog-price">{money(room.rate)} <small>/ night · published rate</small></div><p>Enjoy elegantly furnished accommodation with air conditioning, high-speed Wi-Fi, a Smart TV and soundbar. Complimentary breakfast is part of the DOJ World welcome.</p><div className="doj-detail-amenities"><span><Wifi size={18}/> Wi-Fi</span><span><Wind size={18}/> Air conditioning</span><span><Tv size={18}/> Smart TV</span><span><Coffee size={18}/> Breakfast</span></div><button className="doj-btn" onClick={()=>choose(room)}>Book this room <ArrowUpRight size={17}/></button><p className="doj-detail-note">Check live availability, pay online to confirm your room, or request approval to pay at the hotel.</p><Link className="doj-text-link" href={`/rooms${stayQuery}`}>Explore all rooms <ArrowRight size={17}/></Link></div></section>}
      {page === "home" && <section className="doj-hero" aria-labelledby="home-title">
        <div className="doj-hero-copy">
          <span className="doj-kicker">YOUR OWN CORNER OF IKEJA, LAGOS</span>
          <h1 id="home-title">Stay a little.<br/><span>Feel at home.</span></h1>
          <p>Thoughtful rooms. A warm welcome. A little space to slow down, right in the heart of the city.</p>
          <div className="doj-hero-foot"><MapPin size={15}/><span>ALLEN AVENUE, IKEJA · IT’S ALL ABOUT YOU.</span></div>
        </div>
        <HotelHeroPhotos/>
      </section>}
      {(page === "home" || page === "rooms") && <section className={`doj-booking doj-booking-featured ${page === "rooms" ? "doj-booking-raised" : ""}`} id="booking" aria-label="Plan your stay">
        <div className="doj-booking-title">
          <span className="doj-kicker"><CalendarDays size={14}/> PLAN YOUR STAY</span>
          <h2>A room awaits.</h2>
          <p>Let’s find your dates.</p>
        </div>
        <form onSubmit={search}>
          <label><span>Check in</span><input aria-label="Check in" type="date" min={today} value={arrival} required onChange={e=>{setArrival(e.target.value);if(departure<=e.target.value)setDeparture("");}}/></label>
          <label><span>Check out</span><input aria-label="Check out" type="date" min={arrival ? new Date(Date.parse(arrival)+86400000).toISOString().slice(0,10):today} value={departure} required onChange={e=>{setDeparture(e.target.value);}}/></label>
          <label><span>Room type</span><select aria-label="Room type" value={category} onChange={e=>setCategory(e.target.value)}><option value="All rooms">All room types</option>{["Standard","Deluxe","Royalty","Executive"].map(type=><option key={type} value={type}>{type}</option>)}</select></label>
          <label><span>Guests</span><select aria-label="Guests" value={guests} onChange={e=>{setGuests(e.target.value);}}><option value="1">1 guest</option><option value="2">2 guests</option></select></label>
          <button className="doj-btn">Check availability <ArrowUpRight size={18}/></button>
        </form>
        <small><Check size={13}/><span>Check live availability. Pay online or request to pay at the hotel.</span></small>
      </section>}
      {page === "home" && <section className="doj-home-intro doj-section" aria-labelledby="welcome-title">
        <div className="doj-home-intro-heading"><div><span className="doj-kicker">A MORE PERSONAL STAY</span><h2 id="welcome-title">Right where you need to be.<br/>Just how you like to feel.</h2></div><div><p>Make yourself at home at DOJ World Suites. Tucked just off Allen Avenue, our Ikeja address brings together the ease of the city and the comfort of a place that feels like yours.</p><Link className="doj-text-link" href="/about">The DOJ World story <ArrowUpRight size={17}/></Link></div></div>
        <div className="doj-home-comforts">{[[Coffee,"Breakfast, on us"],[Wifi,"Stay connected"],[Wind,"Cool, quiet comfort"],[ShieldCheck,"A welcome, 24/7"]].map(([Icon,label])=>{const ComfortIcon=Icon as typeof Coffee;return <div key={String(label)}><ComfortIcon size={23} strokeWidth={1.5}/><span>{String(label)}</span></div>;})}</div>
      </section>}
      {(page === "about") && <section className="doj-story doj-section" id="story"><div className="doj-story-photo"><img src="/dojworld/interior.png" alt="Elegantly furnished room at DOJ World Suites" loading="lazy"/><span className="doj-photo-note">A WARM WELCOME, EVERY TIME.</span></div><div className="doj-story-copy"><span className="doj-kicker">THE DOJ WORLD WAY</span><h2>In the heart of Lagos.<br/><em>A world of your own.</em></h2><p>Welcome to DOJ World Suites, centrally located at 13B Bamishile Street, off Allen Avenue, Ikeja, Lagos. Our commitment is to provide exceptional service and a comfortable stay.</p><p>Our rooms and suites are elegantly furnished and equipped with modern amenities. Our staff is dedicated to responding promptly to your needs, so every guest feels truly celebrated.</p><Link className="doj-text-link" href="/experience">Discover the experience <ArrowUpRight size={18}/></Link><div className="doj-story-signature">It’s all about you.<span>THE DOJ WORLD PROMISE</span></div></div></section>}
      {(page === "home" || page === "rooms") && <section className="doj-rooms doj-section" id="rooms"><div className="doj-section-heading"><div><span className="doj-kicker">ROOMS & SUITES</span><h2>Your kind of comfort.</h2></div><p>Inspired by Nigeria. Made for you.<br/>Find a room that feels just right.</p></div>
        {page === "rooms" && <div className="doj-room-toolbar"><div className="doj-filters" aria-label="Filter rooms">{["All rooms","Standard","Deluxe","Royalty","Executive"].map(c=><button key={c} aria-pressed={category===c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{c}</button>)}</div><span>YOUR SPACE TO UNWIND</span></div>}
        {searched && <div className="doj-search-note" role="status"><Check size={18}/><div>Planning {nights} {nights===1?"night":"nights"} for {guests} {guests==="1"?"guest":"guests"}, {arrival} → {departure}.<small>{availability.loading?"Checking live room availability…":availability.error??(!availability.data?.enabled?"Online reservations are opening soon. Contact reception for availability.":"Live availability is shown below. Prices are confirmed before checkout.")}</small></div><button onClick={()=>{setSearched(false);scrollToHotelSection("booking");}}>Edit dates</button></div>}
        <div className="doj-room-grid">{rooms.filter(r=>page === "home" ? ["Mambilla Plateau","Yankari Reserve","Olumo Rock"].includes(r.name) : category==="All rooms"||r.category===category).map((room,index)=><article className="doj-room-card" key={room.name}><Link className="doj-room-image" href={`/rooms/${roomSlug(room)}${stayQuery}`} aria-label={`View ${room.name}`}><img src={`/dojworld/${room.image}`} alt={`${room.name} room at DOJ World Suites`} loading="lazy"/><span>{room.category}</span><span className="doj-room-arrow"><ArrowUpRight size={22}/></span></Link><div className="doj-room-info"><span className="doj-room-number">{String(index+1).padStart(2,"0")} / YOUR PRIVATE RETREAT</span><h3><Link href={`/rooms/${roomSlug(room)}${stayQuery}`}>{room.name}</Link></h3>{searched && availability.data?.enabled && <p className="doj-live-room-status">{availability.data.rooms.find(q=>q.slug===roomSlug(room))?.available ? `Available · ${money((availability.data.rooms.find(q=>q.slug===roomSlug(room))?.totalKobo??0)/100)} for your stay` : "Unavailable for these dates"}</p>}<div><span><strong>{money(room.rate)}</strong> / night</span><Link href={`/rooms/${roomSlug(room)}${stayQuery}`}>Explore room <ArrowUpRight size={15}/></Link></div></div></article>)}</div>{page === "home" && <div className="doj-section-action"><Link className="doj-btn" href="/rooms">Discover all rooms <ArrowUpRight size={17}/></Link></div>}<p className="doj-rate-note">Published room rates. Your dates and final price are confirmed before checkout.</p>
      </section>}
      {(page === "home" || page === "experience") && <section className="doj-experience" id="experience"><div className="doj-experience-image"><img src="/dojworld/lounge.jpg" alt="The bar at DOJ World Suites, with hanging lights and a leafy ceiling" loading="lazy"/><span>GOOD CONVERSATION. GREAT COMPANY.</span></div><div className="doj-experience-copy"><span className="doj-kicker">THE LITTLE THINGS. TAKEN CARE OF.</span><h2>Stay for the comfort.<br/><em>Remember the feeling.</em></h2><p>A leisurely breakfast. A drink at the bar. Your favourite show after a day in the city. Make yourself comfortable — we’ve thought of the details.</p><div className="doj-amenities">{[[Coffee,"Complimentary breakfast"],[Wifi,"High-speed Wi-Fi"],[Wind,"Air-conditioned rooms"],[Tv,"Smart TVs & soundbars"],[Zap,"Standby power"],[ShieldCheck,"CCTV security"]].map(([Icon,label])=>{const AmenityIcon=Icon as typeof Coffee;return <div key={String(label)}><AmenityIcon size={20}/><span>{String(label)}</span></div>;})}</div><div className="doj-dining"><Utensils size={19}/><span>Restaurant & bar <small>A little taste of the good life.</small></span></div></div></section>}
      {(page === "gallery") && <section className="doj-gallery doj-section" id="gallery"><div className="doj-section-heading"><div><span className="doj-kicker">TAKE A LOOK AROUND</span><h2>Picture yourself <em>here.</em></h2></div><span className="doj-gallery-hint">A GLIMPSE INTO YOUR NEXT STAY <ArrowDown size={15}/></span></div><div className="doj-filters doj-gallery-filters" aria-label="Filter gallery">{["All","Facilities","Restaurant & bar","Rooms"].map(c=><button key={c} className={galleryCategory===c?"active":""} aria-pressed={galleryCategory===c} onClick={()=>setGalleryCategory(c)}>{c}</button>)}</div><div className="doj-gallery-grid doj-gallery-full">{galleryPhotos.filter(p=>galleryCategory==="All"||p.category===galleryCategory).map(({image,label,category})=><button key={image} onClick={()=>setPhoto(image)} aria-label={`Enlarge ${label}`}><img src={`/dojworld/${image}`} alt={label} loading="lazy"/><span>{label}<small>{category}</small><ArrowUpRight size={18}/></span></button>)}</div></section>}
      {(page === "contact") && <section className="doj-contact" id="contact"><div><span className="doj-kicker">YOUR LAGOS ADDRESS</span><h2>Close to the city.<br/><em>Far from ordinary.</em></h2><p>Find us just off Allen Avenue, with convenient access to the international and local airports and Ikeja Shopping Mall.</p><p className="doj-opening"><strong>Open 24/7</strong><br/>Monday – Sunday</p><address><MapPin size={22}/><span>13B Bamishile Street, Off Allen Avenue<br/>Ikeja, Lagos, Nigeria</span></address><a className="doj-text-link" href="https://www.google.com/maps/search/?api=1&query=DOJ+World+Suites+13B+Bamishile+Street+Ikeja+Lagos" target="_blank" rel="noreferrer">Get directions <ArrowUpRight size={18}/></a></div><div className="doj-contact-card"><span className="doj-kicker">LET’S MAKE IT A GREAT STAY</span><h3>We’re ready to<br/>welcome you.</h3><a href="tel:+2349133898066"><Phone size={19}/><span>+234 913 389 8066<small>Call our reservations team</small></span><ArrowUpRight size={17}/></a><a href="tel:+2349042660000"><Phone size={19}/><span>+234 904 266 0000<small>Another way to reach us</small></span><ArrowUpRight size={17}/></a><a href="mailto:reservations@dojworld.com"><Mail size={19}/><span>reservations@dojworld.com<small>Reservations and room enquiries</small></span><ArrowUpRight size={17}/></a><a href="mailto:info@dojworld.com"><Mail size={19}/><span>info@dojworld.com<small>General enquiries</small></span><ArrowUpRight size={17}/></a></div></section>}
      {page === "about" && <section className="doj-about-details doj-section"><div><span className="doj-kicker">OUR STANDARD</span><h2>A culture of hospitality.</h2><p>Come and experience the richness and beauty of DOJ World Suites culture. We welcome you to enjoy our hospitality, with comfort, attentive service and contemporary conveniences at the centre of your stay.</p><Link className="doj-text-link" href="/rooms">Find your room <ArrowUpRight size={17}/></Link></div><div><span className="doj-kicker">MAKE THE MOST OF LAGOS</span><h2>Well placed for your visit.</h2><p>Our Ikeja address puts the international and local airports and Ikeja Shopping Mall within convenient reach. Return to a welcoming room, enjoy a meal in our restaurant, or relax with a drink at the bar.</p><Link className="doj-text-link" href="/contact">Find us in Ikeja <ArrowUpRight size={17}/></Link></div></section>}
      {page === "experience" && <section className="doj-story doj-section"><div className="doj-story-photo"><img src="/dojworld/restaurant.jpg" alt="Restaurant and bar at DOJ World Suites" loading="lazy"/></div><div className="doj-story-copy"><span className="doj-kicker">RESTAURANT & BAR</span><h2>Good food.<br/>Time to unwind.</h2><p>Start the day with complimentary breakfast. Enjoy a meal in our restaurant and relax with a drink at the bar, all within DOJ World Suites.</p><p>For dining enquiries or any special requests for your stay, get in touch with our team.</p><Link className="doj-text-link" href="/contact">Speak to our team <ArrowUpRight size={17}/></Link><Link className="doj-text-link" href="/gallery">Explore the gallery <ArrowUpRight size={17}/></Link></div></section>}
      {page !== "contact" && <section className="doj-page-cta"><div><span className="doj-kicker">IT’S ALL ABOUT YOU</span><h2>Let’s plan your stay.</h2><p>Our reservations team is ready to welcome you to Ikeja.</p></div><Link className="doj-btn" href="/contact">Get in touch <ArrowUpRight size={18}/></Link></section>}
    </main>
    <footer className="doj-footer"><div className="doj-footer-top"><div className="doj-footer-brand">DOJ WORLD <span>SUITES</span><p>It’s all about you.</p></div><div><span>MAKE YOURSELF AT HOME</span><Link href="/rooms">Rooms & suites</Link><Link href="/experience">The experience</Link><Link href="/gallery">Gallery</Link><Link href="/booking/recover">Find your booking</Link></div><div><span>LET’S CONNECT</span><a href="tel:+2349133898066">+234 913 389 8066</a><a href="mailto:reservations@dojworld.com">reservations@dojworld.com</a><Link href="/contact">Find us in Ikeja <ArrowUpRight size={13}/></Link></div><Link className="doj-footer-cta" href="/rooms#booking">Your room<br/>is calling.<ArrowUpRight size={28}/></Link></div><div className="doj-footer-bottom"><span>© {today ? today.slice(0,4) : "2026"} DOJ World Suites. All rights reserved.</span><span>MADE FOR MEMORABLE STAYS.</span><Link href="/manage">Staff access <ArrowUpRight size={12}/></Link></div></footer>
    <a className="doj-whatsapp" href="https://wa.me/2349133898066" target="_blank" rel="noreferrer" aria-label="Chat with Dojworld on WhatsApp"><MessageCircle size={22}/><span>Let’s talk about your stay</span></a>
    <dialog ref={dialog} className={photo?"doj-dialog doj-lightbox":"doj-dialog"} onCancel={close} onClick={e=>{if(e.target===dialog.current)close();}} aria-label={selected?`${selected.name} reservation enquiry`:"Hotel photo"}><button className="doj-dialog-close" onClick={close} aria-label="Close dialog"><X size={22}/></button>{photo && <img src={`/dojworld/${photo}`} alt="Dojworld hotel gallery enlarged"/>}{selected && <><img className="doj-dialog-image" src={`/dojworld/${selected.image}`} alt={selected.name}/><div className="doj-dialog-body"><span className="doj-kicker">{selected.category} · DOJ WORLD SUITES</span><h2>{selected.name}</h2><p>{selected.description}</p><OnlineCheckout room={selected} arrival={arrival} departure={departure} guests={guests} today={today} onArrival={value=>{setArrival(value);if(departure<=value)setDeparture("");}} onDeparture={setDeparture} onGuests={setGuests}/>
</div></>}</dialog>
  </div>;
}
