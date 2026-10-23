"use client";
import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { processBookingTasks, recheckBookingPayment, recheckProviderRefund, retryBookingEmail } from "@/app/booking-actions";
import type { ActionState } from "@/app/actions";
import type { HotelContext } from "./hotel-dashboard";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/dojworld";

type Notice = { id: string; kind: string; status: string; attempts: number; last_error: string | null; lease_until: string | null; payload: { reference: string } };
type Check = { booking_id: string; outcome: string; checked_at: string; last_error: string | null; online_bookings: { payment_reference: string; state: string } | null };
type RefundGroup = { bookingId: string; reference: string; reservationId: string; processedKobo: number; recordedKobo: number; refunds: { id: string; amountKobo: number; status: string; checkedAt: string }[] };
function Operation({ action, fields, children, onSaved }: { action: (previous: ActionState, form: FormData) => Promise<ActionState>; fields: Record<string, string>; children: React.ReactNode; onSaved: () => void }) {
  const [state, submit, pending] = useActionState(action, {} as ActionState);
  useEffect(() => { if (state.success) onSaved(); }, [state, onSaved]);
  return <form action={submit} className="booking-operation-form">{Object.entries(fields).map(([key, value]) => <input key={key} type="hidden" name={key} value={value}/>)}<button className="button" disabled={pending}>{pending ? "Checking…" : children}</button>{state.error && <span className="form-error" role="alert">{state.error}</span>}{state.success && <span className="admin-success" role="status">Check complete. Records refreshed.</span>}</form>;
}
export function BookingOperationsPanel({ context }: { context?: HotelContext }) {
  const router = useRouter(); const [revision, setRevision] = useState(0);
  const [notices, setNotices] = useState<Notice[]>([]); const [noticeCount, setNoticeCount] = useState(0);
  const [checks, setChecks] = useState<Check[]>([]); const [refunds, setRefunds] = useState<RefundGroup[]>([]); const [error, setError] = useState("");
  const propertyId = context?.propertyId; const allowed = Boolean(context && ["owner", "manager", "front_desk"].includes(context.role));
  const refresh = useCallback(() => { setRevision(value => value + 1); router.refresh(); }, [router]);
  useEffect(() => {
    if (!allowed || !propertyId) return; let stopped = false;
    async function load() {
      if (document.visibilityState === "hidden") return;
      const client = createClient();
      const [n, c, r] = await Promise.all([
        client.from("booking_notifications").select("id,kind,status,attempts,last_error,lease_until,payload", { count: "exact" }).eq("property_id", propertyId).neq("status", "sent").order("created_at").limit(50),
        client.from("booking_payment_checks").select("booking_id,outcome,checked_at,last_error,online_bookings(payment_reference,state)").eq("property_id", propertyId).neq("outcome", "paid").order("checked_at", { ascending: false }).limit(50),
        client.rpc("get_booking_refund_reconciliation", { p_property_id: propertyId }),
      ]);
      if (stopped) return;
      if (n.error || c.error || r.error) { setError("Apply the booking update to activate email and payment follow-up."); return; }
      setNotices((n.data ?? []) as Notice[]); setNoticeCount(n.count ?? 0); setChecks((c.data ?? []) as unknown as Check[]); setRefunds(r.data ?? []); setError("");
    }
    void load(); const timer = setInterval(() => void load(), 20000); return () => { stopped = true; clearInterval(timer); };
  }, [allowed, propertyId, revision]);
  if (!allowed || !context) return null;
  return <section className="panel booking-operations-panel"><div className="panel-heading"><div><strong>Booking follow-up</strong><small>Email updates · payment checks · refund reconciliation</small></div><button className="button" onClick={refresh}>Refresh follow-up</button></div><div className="channel-panel-content"><div className="booking-connection-status"><span className={`status-pill ${context.emailConnected ? "green-pill" : "amber-pill"}`}>{context.emailConnected ? "Email credentials configured" : "Email sender not connected"}</span><span className="status-pill">{context.bookingWorkerConfigured ? "Scheduled worker endpoint ready" : "Scheduled processing not configured"}</span></div><p>{context.emailConnected ? "Provider acceptance means the email was queued for delivery. Check the email provider for bounces or delivery failures." : "Messages will stay queued until the hotel's verified sender and email key are added. Recovery emails also need this connection."} Use Process booking updates to release due holds, recheck recent payments and send up to three queued emails. Automatic runs need the production scheduler.</p>{error ? <p className="form-error" role="status">{error}</p> : <><Operation action={processBookingTasks} fields={{ property_id: context.propertyId }} onSaved={refresh}>Process booking updates</Operation><details><summary>{noticeCount} email update{noticeCount === 1 ? "" : "s"} awaiting provider acceptance</summary>{!notices.length && <p>No queued or failed messages.</p>}{notices.map(n => <article className="channel-task" key={n.id}><strong>{n.payload.reference}</strong><p>{n.kind.replaceAll("_", " ")} · {n.status} · {n.attempts} attempt{n.attempts === 1 ? "" : "s"}</p>{n.last_error && <small>{n.last_error}</small>}{(n.status === "failed" || (n.status === "processing" && n.lease_until && new Date(n.lease_until).getTime() < Date.now())) && <Operation action={retryBookingEmail} fields={{ notification_id: n.id }} onSaved={refresh}>Queue email retry</Operation>}</article>)}{noticeCount > notices.length && <p>Showing the first {notices.length} of {noticeCount} awaiting messages.</p>}</details><details><summary>Payment checks requiring follow-up ({checks.length}{checks.length === 50 ? "+" : ""})</summary>{!checks.length && <p>No unresolved payment checks.</p>}{checks.map(c => <article className="channel-task" key={c.booking_id}><strong>{c.online_bookings?.payment_reference}</strong><p>{c.outcome === "error" ? "Verification could not complete" : "No successful payment reported"} · {c.online_bookings?.state.replaceAll("_", " ")}</p><small>Last checked {new Date(c.checked_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })} (Lagos). {c.last_error} Confirm with Paystack before requesting another payment.</small><Operation action={recheckBookingPayment} fields={{ property_id: context.propertyId, booking_id: c.booking_id }} onSaved={refresh}>Recheck with Paystack</Operation></article>)}</details><details><summary>Provider refunds ({refunds.length} booking{refunds.length === 1 ? "" : "s"})</summary><p>These provider observations do not post refunds to the hotel ledger. Match completed Paystack refunds to the original payment using the authorized guest folio refund process.</p>{refunds.map(group => <article className="channel-task" key={group.bookingId}><strong>{group.reference}</strong><p>Processed by Paystack: {money(Number(group.processedKobo) / 100)} · Ledger refunds against this online payment: {money(Number(group.recordedKobo) / 100)}</p><span className={`status-pill ${Number(group.processedKobo) === Number(group.recordedKobo) ? "green-pill" : "amber-pill"}`}>{Number(group.processedKobo) === Number(group.recordedKobo) ? "Completed totals match" : "Refund totals need reconciliation"}</span>{group.refunds.map(refund => <div className="booking-refund-line" key={refund.id}><p>Refund {refund.id} · {refund.status} · {money(Number(refund.amountKobo) / 100)}</p><Operation action={recheckProviderRefund} fields={{ property_id: context.propertyId, provider_id: refund.id }} onSaved={refresh}>Recheck refund</Operation></div>)}<a href={`/manage/reservations/${group.reservationId}/confirmation`} target="_blank" rel="noreferrer">Open booking records</a></article>)}</details></>}</div></section>;
}
