import "server-only";
import { channelLabel } from "@/lib/booking/channels";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DocumentPrintButton } from "@/components/document-print-button";

type Payment = { id: string; amount_kobo: number; received_at: string; reference: string | null; received_by: string | null; is_deposit: boolean; payment_methods: { name: string } | { name: string }[] | null };
type Refund = { id: string; payment_id: string; amount_kobo: number; created_at: string };
type Reservation = { id: string; organization_id: string; property_id: string; status: string; arrival_date: string; departure_date: string; adults: number; source?:string; external_reference?:string|null; external_unit_reference?:string|null; channel_name?:string|null; channel_collection?:string; payment_deadline?:string|null;
  guests: { full_name: string } | { full_name: string }[] | null;
  reservation_rooms: { rooms: { room_number: string; room_types: { name: string } | { name: string }[] | null } | { room_number: string; room_types: { name: string } | { name: string }[] | null }[] | null }[] };
const first = <T,>(value: T | T[] | null | undefined): T | undefined => Array.isArray(value) ? value[0] : value ?? undefined;
const money = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amount / 100);
const timestamp = (date: string) => new Date(date).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
const receiptNumber = (id: string) => `RC-${id.replaceAll("-", "").toUpperCase()}`;

function Unavailable() {
  return <main className="setup-page"><section className="setup-card"><h1>Document unavailable</h1><p>This document could not be loaded with your staff access. Refresh the page or return to Reservations.</p><Link className="button" href="/manage#reservations">Back to reservations</Link></section></main>;
}

export async function ReservationDocument({ id, kind }: { id: string; kind: "confirmation" | "receipt" }) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/auth/login");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return <Unavailable/>;
  let reservationId = id;
  let selectedPayment: Payment | undefined;
  if (kind === "receipt") {
    // Load this exact receipt directly, regardless of how many payments exist.
    const { data: payment, error } = await client.from("payments").select("id,folio_id,amount_kobo,received_at,reference,received_by,is_deposit,payment_methods(name)").eq("id", id).maybeSingle();
    if (error || !payment) return <Unavailable/>;
    selectedPayment = payment as unknown as Payment;
    const { data: folio, error: folioError } = await client.from("folios").select("reservation_id").eq("id", payment.folio_id).maybeSingle();
    if (folioError || !folio) return <Unavailable/>;
    reservationId = folio.reservation_id;
  }
  const { data, error } = await client.from("reservations").select("*,guests(full_name),reservation_rooms(rooms(room_number,room_types(name)))").eq("id", reservationId).maybeSingle();
  if (error || !data) return <Unavailable/>;
  const stay = data as unknown as Reservation;
  // Every read uses the signed-in staff client and existing property/finance RLS.
  // A booking confirmation also requires guest access; room-only staff cannot print it.
  const guest = first(stay.guests);
  if (!guest || !stay.reservation_rooms.length) return <Unavailable/>;
  const [{ data: property, error: propertyError }, { data: folio, error: folioError }, { data: summaries, error: summaryError }] = await Promise.all([
    client.from("properties").select("name,address").eq("id", stay.property_id).maybeSingle(),
    client.from("folios").select("id").eq("reservation_id", stay.id).maybeSingle(),
    client.rpc("get_reservation_payment_summaries", { p_property_id: stay.property_id, p_reservation_ids: [stay.id] }),
  ]);
  if (propertyError || !property || folioError || summaryError || summaries?.length !== 1) return <Unavailable/>;
  const summary = summaries[0];
  const total = Number(summary.room_total_kobo);
  const received = Number(summary.gross_paid_kobo);
  const refunded = Number(summary.refunded_kobo);
  const net = Number(summary.net_paid_kobo);
  if ([summary.room_total_kobo, summary.gross_paid_kobo, summary.refunded_kobo, summary.net_paid_kobo].some(value => value === null || value === undefined)
    || [total, received, refunded, net].some(value => !Number.isSafeInteger(value) || value < 0)) return <Unavailable/>;
  const payments: Payment[] = [];
  if (kind === "confirmation" && folio) {
    for (let offset = 0; ; offset += 500) {
      const { data: rows, error: pageError } = await client.from("payments").select("id,amount_kobo,received_at,reference,received_by,is_deposit,payment_methods(name)")
        .eq("folio_id", folio.id).order("id").range(offset, offset + 499);
      if (pageError) return <Unavailable/>;
      payments.push(...((rows ?? []) as unknown as Payment[]));
      if ((rows?.length ?? 0) < 500) break;
    }
  }
  const payment = selectedPayment;
  const paymentRefunds: Refund[] = [];
  if (payment) {
    for (let offset = 0; ; offset += 500) {
      const { data: rows, error: pageError } = await client.from("payment_refunds").select("id,payment_id,amount_kobo,created_at")
        .eq("payment_id", payment.id).order("id").range(offset, offset + 499);
      if (pageError) return <Unavailable/>;
      paymentRefunds.push(...((rows ?? []) as Refund[]));
      if ((rows?.length ?? 0) < 500) break;
    }
  }
  const nights = Math.round((new Date(`${stay.departure_date}T00:00:00Z`).getTime() - new Date(`${stay.arrival_date}T00:00:00Z`).getTime()) / 86400000);
  const paymentRefunded = paymentRefunds.reduce((sum, refund) => sum + Number(refund.amount_kobo), 0);
  if (payment && (!Number.isSafeInteger(Number(payment.amount_kobo)) || !Number.isSafeInteger(paymentRefunded) || paymentRefunded > Number(payment.amount_kobo))) return <Unavailable/>;
  let collector = payment?.received_by ? "Reception" : first(payment?.payment_methods)?.name === "Paystack online" ? "Verified online via Paystack" : "Hotel payment record";
  if (payment?.received_by) {
    const { data: member } = await client.from("organization_memberships").select("full_name").eq("organization_id", stay.organization_id).eq("user_id", payment.received_by).maybeSingle();
    collector = member?.full_name || "Reception";
  }
  const roomNames = stay.reservation_rooms.map(assignment => { const room = first(assignment.rooms); return room ? `${room.room_number} · ${first(room.room_types)?.name ?? "Room"}` : "Assigned room"; }).join(", ");
  return <main className="payment-document-page"><article className="payment-document">
    <div className="payment-document-actions"><Link className="button" href="/manage#reservations">Back to reservations</Link><DocumentPrintButton/></div>
    <header className="payment-document-brand"><div className="eyebrow">DOJ WORLD SUITES</div><h1>{payment ? "Payment receipt" : "Booking confirmation"}</h1><p>{property.name}{property.address && <><br/>{property.address}</>}</p></header>
    <div className="payment-document-details"><dl>
      {payment && <div><dt>Receipt number</dt><dd>{receiptNumber(payment.id)}</dd></div>}
      <div><dt>Reservation reference</dt><dd>{stay.id.slice(0, 8).toUpperCase()}</dd></div>
      <div><dt>Guest</dt><dd>{guest.full_name}</dd></div><div><dt>Room</dt><dd>{roomNames}</dd></div>
      <div><dt>Arrival / departure</dt><dd>{stay.arrival_date} → {stay.departure_date} · {nights} night{nights === 1 ? "" : "s"}</dd></div>
      <div><dt>Booking source</dt><dd>{channelLabel(stay.source,stay.channel_name)}{stay.external_reference&&` · ${stay.external_reference}${stay.external_unit_reference?` / room ${stay.external_unit_reference}`:""}`}</dd></div>{stay.payment_deadline&&<div><dt>Unpaid hold deadline</dt><dd>{timestamp(stay.payment_deadline)} WAT</dd></div>}<div><dt>Guests</dt><dd>{stay.adults}</dd></div><div><dt>Reservation status</dt><dd>{stay.status.replaceAll("_", " ")}</dd></div>
      {payment && <><div><dt>Payment received</dt><dd>{timestamp(payment.received_at)} WAT</dd></div><div><dt>Payment method</dt><dd>{first(payment.payment_methods)?.name ?? "Recorded payment method"}</dd></div><div><dt>Transaction reference</dt><dd>{payment.reference || "—"}</dd></div><div><dt>Recorded by</dt><dd>{collector}</dd></div></>}
    </dl></div>
    {payment && <section className="payment-document-summary"><h2>This payment</h2><dl><div><dt>Amount received</dt><dd>{money(Number(payment.amount_kobo))}</dd></div>{paymentRefunded > 0 && <><div><dt>Refunds recorded</dt><dd>{money(paymentRefunded)}</dd></div><div><dt>Net amount retained</dt><dd>{money(Number(payment.amount_kobo) - paymentRefunded)}</dd></div></>}</dl><p>{payment.is_deposit ? "Received as an advance toward this stay. Advances are applied as hotel charges are posted." : "Received against posted charges on the guest account."}</p></section>}
    <section className="payment-document-summary"><h2>Accommodation summary</h2><dl><div><dt>Agreed room total</dt><dd>{money(total)}</dd></div><div><dt>Total payments recorded</dt><dd>{money(received)}</dd></div>{refunded > 0 && <div><dt>Total refunds recorded</dt><dd>{money(refunded)}</dd></div>}<div><dt>Net payments retained</dt><dd>{money(net)}</dd></div>{!["cancelled", "no_show"].includes(stay.status) && <div><dt>{stay.channel_collection==="collected_by_channel"?"Channel payout / balance to verify":"Remaining quoted accommodation"}</dt><dd>{money(Math.max(total - net, 0))}</dd></div>}</dl>{stay.channel_collection==="collected_by_channel"&&<p>The channel reports collecting the guest payment. Reception must verify the payout and any remaining amount before collecting money from the guest. This report is separate from funds actually received by the hotel.</p>}{!payment && <p>{received === 0 ? "No payment has been recorded. This booking confirmation is not a payment receipt." : "This confirms the booking. Individual payment receipts are listed below."}</p>}</section>
    {!payment && payments.length > 0 && <section><h2>Recorded payments</h2>{payments.map(row => <p key={row.id}><Link href={`/manage/payments/${row.id}/receipt`}>{receiptNumber(row.id)}</Link> · {money(Number(row.amount_kobo))} · {first(row.payment_methods)?.name}</p>)}</section>}
    {paymentRefunds.length > 0 && <section><h2>Recorded refunds</h2>{paymentRefunds.map(refund => <p key={refund.id}>{timestamp(refund.created_at)} WAT · {money(Number(refund.amount_kobo))}</p>)}</section>}
    <p className="payment-document-note">Accommodation totals exclude additional services. The final guest folio shows all posted charges and credits. This document reflects the hotel’s records when opened. {payment ? "This receipt acknowledges the payment above and is not a tax invoice." : "Payment is due according to the terms agreed with reception."}</p>
  </article></main>;
}
