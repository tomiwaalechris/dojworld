"use client";
import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { bulkOnlineRooms, decideOnlineRequest, saveOnlineRoom, saveOnlineSettings, recheckBookingPayment, recheckBookingRefunds } from "@/app/booking-actions";
import type { ActionState } from "@/app/actions";
import type { HotelContext } from "./hotel-dashboard";
import type { StaffOnlineBooking } from "@/lib/booking/types";
import { rooms, roomSlug, money } from "@/lib/dojworld";
import { parsePaymentSummary, type PaymentSummaryRow, type ReservationPaymentSummary as PaymentSummary } from "@/lib/booking/payment-summary";
import { ReservationPaymentSummary } from "@/components/reservation-payment-summary";

function Result({state}:{state:ActionState}){return <>{state.error&&<p className="form-error" role="alert">{state.error}</p>}{state.success&&<p className="admin-success" role="status">Saved. Refreshing hotel records…</p>}</>;}
function PaymentCheck({booking,propertyId,onSaved}:{booking:StaffOnlineBooking;propertyId:string;onSaved:()=>void}){
  const [state,action,pending]=useActionState(booking.payment_id?recheckBookingRefunds:recheckBookingPayment,{} as ActionState);
  useEffect(()=>{if(state.success)onSaved();},[state,onSaved]);
  if(booking.payment_plan==="arrival")return null;
  return <form action={action} className="booking-operation-form"><input name="property_id" type="hidden" value={propertyId}/><input name="booking_id" type="hidden" value={booking.id}/><button className="button" disabled={pending}>{pending?"Checking provider…":booking.payment_id?"Check Paystack refunds":"Recheck payment with Paystack"}</button>{state.error&&<span className="form-error" role="alert">{state.error}</span>}{state.success&&<span className="admin-success" role="status">Provider check complete. Follow-up records refreshed.</span>}</form>;
}
function Decision({booking,onSaved}:{booking:StaffOnlineBooking;onSaved:()=>void}) {
  const [state,action,pending]=useActionState(decideOnlineRequest,{} as ActionState);
  useEffect(()=>{if(state.success)onSaved();},[state,onSaved]);
  return <form action={action} className="online-decision"><input type="hidden" name="id" value={booking.id}/><label>Payment / arrival deadline (Lagos)<input name="deadline" type="datetime-local" defaultValue={`${booking.arrival_date}T18:00`}/></label><label>Decision note / guest contact record<input name="note" required minLength={5} maxLength={500} placeholder="Record the terms and deadline agreed with the guest"/></label><div><button className="button button-primary" name="decision" value="approve" disabled={pending}>Approve & reserve room</button><button className="button" name="decision" value="reject" disabled={pending}>Decline request</button></div><Result state={state}/></form>;
}
export function OnlineBookingsPanel({context}:{context?:HotelContext}) {
  const [revision,setRevision]=useState(0);
  const router=useRouter();
  const [bookings,setBookings]=useState<StaffOnlineBooking[]>([]);
  const [summaries,setSummaries]=useState<Record<string,PaymentSummary>>({});
  const [error,setError]=useState("");
  const [paymentError,setPaymentError]=useState("");
  const propertyId=context?.propertyId;
  useEffect(()=>{
    if(!propertyId)return;
    let stopped=false;
    async function load(){
      if(document.visibilityState==="hidden")return;
      const client=createClient();
      const {data,error}=await client.from("online_bookings").select("id,guest_name,guest_email,guest_phone,slug,state,payment_plan,arrival_date,departure_date,quoted_total_kobo,due_now_kobo,payment_id,reservation_id,payment_reference,expires_at,created_at,decision_note").eq("property_id",propertyId).order("created_at",{ascending:false}).limit(100);
      if(stopped)return;
      if(error){setError("Website bookings could not be loaded. Check the hotel connection and try again.");return;}
      const rows:StaffOnlineBooking[]=data??[];
      const ids=[...new Set(rows.flatMap(row=>row.reservation_id?[row.reservation_id]:[]))];
      const result=ids.length?await client.rpc("get_reservation_payment_summaries",{p_property_id:propertyId,p_reservation_ids:ids}):{data:[],error:null};
      if(stopped)return;
      const payments:Record<string,PaymentSummary>={};
      if(!result.error)for(const row of (result.data??[]) as PaymentSummaryRow[]){const summary=parsePaymentSummary(row);if(summary)payments[row.reservation_id]=summary;}
      setBookings(rows);setSummaries(payments);setError("");
      setPaymentError(result.error?"Payment details are unavailable. Apply the booking update and refresh to show collected amounts and receipts.":"");
    }
    void load();const timer=setInterval(()=>void load(),15000);
    return()=>{stopped=true;clearInterval(timer);};
  },[propertyId,revision]);
  const refresh=useCallback(()=>{setRevision(value=>value+1);router.refresh();},[router]);
  return <section className="panel online-bookings-panel">
    <div className="panel-heading"><div><strong>Website reservations</strong><small>Online payments and pay-at-hotel requests · updates every 15 seconds</small></div><button className="button" onClick={refresh}>Refresh bookings</button></div>
    {!context?<p className="empty-state">Connect the dedicated Dojworld database to receive website bookings here.</p>:error?<p className="empty-state" role="alert">{error}</p>:!bookings.length?<p className="empty-state">No website reservations yet. Online bookings will appear here with their payment status.</p>:<div className="online-booking-list">
      {paymentError&&<p className="form-error" role="status">{paymentError}</p>}
      {bookings.map(b=><article key={b.id} className={`online-booking-item ${b.state==="payment_review"?"online-needs-review":""}`}>
        <div className="online-booking-summary"><div><strong>{b.guest_name}</strong><small>{rooms.find(r=>roomSlug(r)===b.slug)?.name??b.slug} · {b.arrival_date} → {b.departure_date}</small><small>{b.payment_reference}</small><span className="status-pill">{b.state.replaceAll("_"," ")}</span></div><div><strong>{money(Number(b.quoted_total_kobo)/100)}</strong><small>Quoted accommodation</small>{b.reservation_id?<ReservationPaymentSummary summary={summaries[b.reservation_id]} state={b.state}/>:<small>Unpaid · reception approval required</small>}</div></div>
        <div className="online-booking-contact"><a href={`tel:${b.guest_phone}`}>{b.guest_phone}</a><a href={`mailto:${b.guest_email}`}>{b.guest_email}</a>{b.reservation_id&&<a href={`/manage/reservations/${b.reservation_id}/confirmation`} target="_blank" rel="noreferrer">Booking confirmation</a>}</div>
        {b.state==="payment_review"&&<p role="alert">Payment is recorded, but the room is not confirmed. Contact the guest to arrange accommodation or a refund through Paystack, and record the refund in the guest folio.</p>}
        {b.decision_note&&<p>{b.decision_note}</p>}
        {b.expires_at&&<small>Deadline: {new Date(b.expires_at).toLocaleString("en-NG",{timeZone:"Africa/Lagos"})} (Lagos)</small>}
        {b.state==="requested"&&["owner","manager","front_desk"].includes(context.role)&&<Decision booking={b} onSaved={refresh}/>}
        {["owner","manager","front_desk"].includes(context.role)&&<PaymentCheck booking={b} propertyId={context.propertyId} onSaved={refresh}/>}
      </article>)}
    </div>}
  </section>;
}
type Settings={online_enabled:boolean;arrival_requests_enabled:boolean;cancellation_policy:string};
function SettingsForm({settings}:{settings:Settings}){
  const [state,action,pending]=useActionState(saveOnlineSettings,{} as ActionState);
  const [enabled,setEnabled]=useState(settings.online_enabled);
  const [arrival,setArrival]=useState(settings.arrival_requests_enabled);
  const [policy,setPolicy]=useState(settings.cancellation_policy);
  return <form action={action} className="reservation-form online-settings-form"><label className="online-checkbox"><input type="checkbox" name="enabled" checked={enabled} onChange={e=>setEnabled(e.target.checked)} disabled={pending}/> Enable website reservations</label><label className="online-checkbox"><input type="checkbox" name="arrival_requests" checked={arrival} onChange={e=>setArrival(e.target.checked)} disabled={pending}/> Allow requests to pay at the hotel (staff approval required)</label><label>Cancellation and refund terms shown before checkout<textarea name="policy" required minLength={30} maxLength={3000} value={policy} onChange={e=>setPolicy(e.target.value)} rows={5} readOnly={pending}/></label><p>Use final room rates inclusive of mandatory charges. Review the physical rooms, prices, terms and payment connection before opening website reservations.</p><Result state={state}/><button className="button button-primary" disabled={pending}>Save booking settings</button></form>;
}
function Mapping({slug,roomId,enabled,context,onSaved,disabled}:{slug:string;roomId:string;enabled:boolean;context:HotelContext;onSaved:()=>void;disabled:boolean}){
  const [state,action,pending]=useActionState(saveOnlineRoom,{} as ActionState);
  const [selectedRoom,setSelectedRoom]=useState(roomId);
  const [available,setAvailable]=useState(enabled);
  useEffect(()=>{if(state.success)onSaved();},[state,onSaved]);
  return <form action={action} className="online-room-mapping"><input type="hidden" name="slug" value={slug}/><div><strong>{rooms.find(r=>roomSlug(r)===slug)?.name??slug}</strong><small className="sub-cell">{enabled?"Listed online":"Online bookings paused"}</small></div><label>Actual hotel room<select name="room_id" value={selectedRoom} onChange={e=>setSelectedRoom(e.target.value)} disabled={disabled||pending}>{context.rooms.map(r=><option key={r.id} value={r.id}>{r.number} · {r.type}</option>)}</select></label><label className="online-checkbox"><input type="checkbox" name="enabled" checked={available} onChange={e=>setAvailable(e.target.checked)} disabled={disabled||pending}/> Available online</label><button className="button" disabled={disabled||pending}>Save room</button><Result state={state}/></form>;
}
export function OnlineBookingSettings({context}:{context:HotelContext}) {
  const [settings,setSettings]=useState<Settings>();const [mappings,setMappings]=useState<{slug:string;room_id:string;enabled:boolean}[]>([]);const [error,setError]=useState("");
  const [selected,setSelected]=useState<string[]>([]);
  const [revision,setRevision]=useState(0);
  const [bulkState,bulkAction,bulkPending]=useActionState(bulkOnlineRooms,{} as ActionState);
  const refreshMappings=useCallback(()=>setRevision(value=>value+1),[]);
  useEffect(()=>{if(bulkState.success){setSelected([]);refreshMappings();}},[bulkState,refreshMappings]);
  useEffect(()=>{let stopped=false;const c=createClient();Promise.all([c.from("dojworld_settings").select("online_enabled,arrival_requests_enabled,cancellation_policy").eq("property_id",context.propertyId).single(),c.from("online_room_listings").select("slug,room_id,enabled").order("slug")]).then(([s,m])=>{if(stopped)return;if(s.error||m.error)setError("Install the dedicated Dojworld schema to configure online bookings.");else{setSettings(s.data);setMappings(m.data??[]);setError("");}});return()=>{stopped=true;};},[context.propertyId,revision]);
  if(context.role!=="owner")return null;
  return <section className="panel online-bookings-panel"><div className="panel-heading"><div><strong>Website booking connection</strong><small>Online bookings and reception share the same room availability.</small></div></div>{error?<p className="empty-state">{error}</p>:!settings?<p className="empty-state">Loading booking connection…</p>:<div className="online-settings-content"><SettingsForm key={context.propertyId} settings={settings}/><div className="online-inventory-heading"><div><h3>Online room availability</h3><p>Rooms are listed online by default. Reservations block their booked dates automatically. Pause a listing when you want to stop accepting new online bookings for it.</p></div><span className="status-pill green-pill">{mappings.filter(m=>m.enabled).length} of {mappings.length} listed</span></div><form action={bulkAction} className="online-bulk-controls"><input type="hidden" name="property_id" value={context.propertyId}/>{selected.map(slug=><input key={slug} type="hidden" name="slug" value={slug}/>)}<label className="online-checkbox"><input type="checkbox" checked={mappings.length>0&&selected.length===mappings.length} onChange={e=>setSelected(e.target.checked?mappings.map(m=>m.slug):[])} disabled={bulkPending||!mappings.length}/> Select all rooms</label><span>{selected.length} selected</span><div><button className="button button-primary" name="availability" value="enabled" disabled={bulkPending||!selected.length}>{bulkPending?"Updating…":"Make available online"}</button><button className="button" name="availability" value="paused" disabled={bulkPending||!selected.length}>Pause online bookings</button></div><Result state={bulkState}/></form><p>Each website room maps to one actual hotel room. Existing reservations keep their rooms when a listing is paused.</p>{mappings.map(m=><div className="online-room-row" key={`${m.slug}:${m.room_id}:${m.enabled}`}><label className="online-row-select"><input type="checkbox" aria-label={`Select ${rooms.find(r=>roomSlug(r)===m.slug)?.name??m.slug}`} checked={selected.includes(m.slug)} onChange={e=>setSelected(current=>e.target.checked?[...current,m.slug]:current.filter(slug=>slug!==m.slug))} disabled={bulkPending}/></label><Mapping slug={m.slug} roomId={m.room_id} enabled={m.enabled} context={context} onSaved={refreshMappings} disabled={bulkPending}/></div>)}</div>}</section>;
}
