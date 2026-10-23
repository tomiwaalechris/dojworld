"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, Pause, Play, X } from "lucide-react";

const heroPhotos = [
  { src: "interior.png", alt: "A DOJ World suite with white linens and lounge seating" },
  { src: "olumo-1.png", alt: "Another view of the Olumo Rock Executive room" },
  { src: "lounge.jpg", alt: "The bar at DOJ World with hanging lights and a leafy ceiling" },
];

export function HotelHeroPhotos() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    const visibility = () => setVisible(!document.hidden);
    update(); visibility();
    preference.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    return () => { preference.removeEventListener("change", update); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    if (paused || hovered || reduced || !visible) return;
    const timer = window.setInterval(() => setActive(index => (index + 1) % heroPhotos.length), 7000);
    return () => window.clearInterval(timer);
  }, [paused, hovered, reduced, visible]);
  return <>
    <div className="doj-hero-image" aria-hidden="true">{heroPhotos.map((photo, index) => <img key={photo.src} src={`/dojworld/${photo.src}`} alt="" className={index === active ? "is-active" : ""} fetchPriority={index === 0 ? "high" : "low"}/>)}</div>
    <div className="doj-hero-slides" role="group" aria-label="Hotel photographs" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={event => { if (!(event.target as HTMLElement).closest("[data-slideshow-toggle]")) setPaused(true); }}>
      <span className="doj-sr-only" aria-live={paused || reduced ? "polite" : "off"}>{heroPhotos[active].alt}</span>
      {heroPhotos.map((photo, index) => <button key={photo.src} aria-label={`Show hotel photo ${index + 1}: ${photo.alt}`} aria-pressed={index === active} onClick={() => { setActive(index); setPaused(true); }}><span/></button>)}
      {!reduced && <button data-slideshow-toggle aria-label={paused ? "Play hero slideshow" : "Pause hero slideshow"} onClick={() => setPaused(value => !value)}>{paused ? <Play size={15}/> : <Pause size={15}/>}</button>}
    </div>
  </>;
}

export function RoomPhotoGallery({ name, photos }: { name: string; photos: readonly string[] }) {
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const step = (amount: number) => setActive(index => (index + amount + photos.length) % photos.length);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    const viewer = dialog.current;
    viewer?.showModal();
    document.body.style.overflow = "hidden";
    return () => { viewer?.close(); document.body.style.overflow = previous; };
  }, [expanded]);
  const controls = <>
    <button className="doj-photo-prev" aria-label={`Previous ${name} photo`} onClick={() => step(-1)}><ChevronLeft size={20}/></button>
    <button className="doj-photo-next" aria-label={`Next ${name} photo`} onClick={() => step(1)}><ChevronRight size={20}/></button>
    <span className="doj-photo-count" aria-live="polite">{active + 1} / {photos.length}</span>
  </>;
  return <div className="doj-room-photos">
    <div className="doj-detail-photo">
      <button className="doj-photo-enlarge" aria-label={`Enlarge ${name} photo ${active + 1}`} onClick={() => setExpanded(true)}><img src={`/dojworld/${photos[active]}`} alt={`${name} — view ${active + 1} of ${photos.length}`}/><span><Expand size={16}/> View photos</span></button>
      {controls}
    </div>
    <div className="doj-photo-thumbnails" aria-label={`${name} photo thumbnails`}>{photos.map((src, index) => <button key={src} aria-label={`Show ${name} photo ${index + 1}`} aria-pressed={active === index} onClick={() => setActive(index)}><img src={`/dojworld/${src}`} alt="" loading="lazy"/></button>)}</div>
    <dialog ref={dialog} className="doj-room-lightbox" aria-label={`${name} photographs`} onCancel={() => setExpanded(false)} onClick={event => { if (event.target === dialog.current) setExpanded(false); }} onKeyDown={event => { if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); } if (event.key === "ArrowRight") { event.preventDefault(); step(1); } }}>
      <button className="doj-photo-close" aria-label="Close room photos" onClick={() => setExpanded(false)}><X size={22}/></button>
      <img src={`/dojworld/${photos[active]}`} alt={`${name} — view ${active + 1} of ${photos.length}`}/>
      {controls}
    </dialog>
  </div>;
}
