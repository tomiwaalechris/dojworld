"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "@/app/dojworld.css";

export function BookingRecovery({ access = false }: { access?: boolean }) {
  const [token, setToken] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => {
    if (access) { setToken(new URLSearchParams(window.location.search).get("token") ?? ""); window.history.replaceState(null, "", "/booking/access"); }
  }, [access]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(access ? "/api/booking/access" : "/api/booking/recover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(access ? { token } : { reference: form.get("reference"), email: form.get("email") }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      if (access) { window.location.assign(result.url); return; }
      setMessage(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again or call reception."); }
    finally { setBusy(false); }
  }
  return <div className="doj-site"><main className="doj-confirmation-page"><Link href="/" className="doj-confirmation-brand">DOJ WORLD SUITES</Link><section className="doj-confirmation-card"><h1>{access ? "Open your booking" : "Find your booking"}</h1><p>{access ? "Continue to see your latest room, dates and payment status. This private link can be used once." : "Enter the full reference and email address used for your website booking. We’ll email a private link to your confirmation."}</p><form className="doj-recovery-form" onSubmit={submit}>{!access && <><label>Booking reference<input name="reference" required maxLength={36} placeholder="DOJ-…" autoComplete="off"/></label><label>Booking email<input name="email" type="email" required maxLength={254} autoComplete="email"/></label></>}{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}<button className="doj-btn" disabled={busy || (access && !token)}>{busy ? "Please wait…" : access ? "Open booking" : "Send private link"}</button></form>{access && <Link href="/booking/recover" className="doj-text-link">Request a new link</Link>}<a className="doj-text-link" href="tel:+2349133898066">Call reception</a><Link className="doj-text-link" href="/rooms">Back to rooms</Link></section></main></div>;
}
