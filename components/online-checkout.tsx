"use client";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, ChevronDown, LoaderCircle, ShieldCheck } from "lucide-react";
import { money, roomSlug, type DojRoom } from "@/lib/dojworld";
import { useAvailability } from "@/lib/booking/use-availability";
import type { PaymentPlan } from "@/lib/booking/types";

export function OnlineCheckout({room,arrival,departure,guests,today,onArrival,onDeparture,onGuests}:{room:DojRoom;arrival:string;departure:string;guests:string;today:string;onArrival:(v:string)=>void;onDeparture:(v:string)=>void;onGuests:(v:string)=>void}) {
  const {data,error,loading,refresh}=useAvailability(arrival,departure,guests);
  const quote=data?.rooms.find(r=>r.slug===roomSlug(room));
  const [plan,setPlan]=useState<PaymentPlan>("deposit");
  const [name,setName]=useState("");const [email,setEmail]=useState("");const [phone,setPhone]=useState("");
  const [accepted,setAccepted]=useState(false);const [pending,setPending]=useState(false);const [failure,setFailure]=useState("");
  const attempt=useRef<{key:string;id:string;token:string} | undefined>(undefined);
  const enabled=Boolean(data?.enabled && quote?.available && (data.paymentsReady || data.arrivalRequests));
  const effectivePlan= !data?.paymentsReady && data?.arrivalRequests ? "arrival" : plan;
  const due=effectivePlan==="full"?quote?.totalKobo:effectivePlan==="deposit"?quote?.depositKobo:0;
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!quote||!enabled)return;setFailure("");setPending(true);
    const body={slug:roomSlug(room),arrival,departure,guests:Number(guests),name,email,phone,plan:effectivePlan,expectedTotal:quote.totalKobo,expectedPolicy:data?.policy,acceptedPolicy:accepted};
    const key=JSON.stringify(body);
    if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID(),token:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("")};
    try {
      const response=await fetch("/api/booking/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,id:attempt.current.id,token:attempt.current.token})});
      const result=await response.json();
      if(!response.ok){if(response.status===409){attempt.current=undefined;refresh();}throw new Error(result.error || "Your booking could not be created.");}
      if(result.checkoutUrl)window.location.assign(result.checkoutUrl);
      else window.location.assign(`/booking/return?id=${encodeURIComponent(result.id)}`);
    } catch(error) {setFailure(error instanceof Error?error.message:"Please try again.");setPending(false);}
  }
  return <div className="doj-online-checkout"><p>Choose your dates to check the hotel’s live room availability.</p><form onSubmit={submit}>
    <fieldset disabled={pending}>
      <div className="doj-dialog-dates"><label>Check in<input type="date" min={today} required value={arrival} onChange={e=>onArrival(e.target.value)}/></label><label>Check out<input type="date" min={arrival?new Date(Date.parse(arrival)+86400000).toISOString().slice(0,10):today} required value={departure} onChange={e=>onDeparture(e.target.value)}/></label></div>
      <label className="doj-online-guests">Guests<select value={guests} onChange={e=>onGuests(e.target.value)}><option value="1">1 guest</option><option value="2">2 guests</option></select></label>
      <div className="doj-online-availability" role="status">{loading?"Checking live availability…":error?error:data&&!data.enabled?"Online reservations are opening soon. Call reception to arrange your stay.":data?.enabled&&!data.paymentsReady&&!data.arrivalRequests?"Online payment is temporarily unavailable. Please contact reception.":quote&&!quote.available?"This room is unavailable for your dates. Please choose another room or dates.":enabled?"Available for your selected dates.":"Select check-in and check-out dates to continue."}</div>
      {enabled&&quote&&<><div className="doj-estimate"><span>Total for your stay</span><strong>{money(quote.totalKobo/100)}</strong></div>
        <div className="doj-dialog-dates"><label>Your full name<input required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label><label>Phone number<input required type="tel" minLength={7} maxLength={30} autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label></div>
        <label className="doj-online-guests">Email address<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <fieldset className="doj-payment-options"><legend>How would you like to pay?</legend>
          {data?.paymentsReady&&<><label><input type="radio" name="payment-plan" checked={effectivePlan==="deposit"} onChange={()=>setPlan("deposit")}/><span>Pay a deposit <strong>{money(quote.depositKobo/100)} now</strong><small>First night paid online. Balance at the hotel.</small></span></label><label><input type="radio" name="payment-plan" checked={effectivePlan==="full"} onChange={()=>setPlan("full")}/><span>Pay in full <strong>{money(quote.totalKobo/100)} now</strong><small>Confirm your room with full online payment.</small></span></label></>}
          {data?.arrivalRequests&&<label><input type="radio" name="payment-plan" checked={effectivePlan==="arrival"} onChange={()=>setPlan("arrival")}/><span>Request to pay at the hotel<small>Reception must approve. Your room is not reserved until approved.</small></span></label>}
        </fieldset>
        <details className="doj-booking-policy"><summary>Cancellation & booking terms<ChevronDown size={17} aria-hidden="true"/></summary><p>{data?.policy}</p><p>Your name, email and phone number are used by the hotel to manage this reservation{effectivePlan!=="arrival"?". Your email is also sent to Paystack for checkout":""}.</p></details>
        <label className="doj-policy-check"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} required/><span>I agree to these booking terms.</span></label>
        {failure&&<p className="doj-checkout-error" role="alert">{failure}</p>}
        <button className="doj-btn" disabled={pending||(!data?.paymentsReady&&!data?.arrivalRequests)}>{pending?<><LoaderCircle size={17} className="spin"/> Preparing your booking…</>:effectivePlan==="arrival"?<>Send reservation request <ArrowRight size={17}/></>:<>Pay {money((due??0)/100)} securely <ArrowRight size={17}/></>}</button>
        <p className="doj-secure-note"><ShieldCheck size={14}/>{effectivePlan==="arrival"?"No payment is collected for a request.":"Your room is held for 15 minutes during checkout. Confirmation follows verified payment."}</p>
      </>}
    </fieldset>
  </form>{!enabled&&<a className="doj-text-link" href="tel:+2349133898066">Call reservations · +234 913 389 8066</a>}</div>;
}
