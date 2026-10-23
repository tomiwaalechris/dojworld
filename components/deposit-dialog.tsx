"use client";

import { useActionState, useEffect, useState } from "react";
import { X } from "lucide-react";
import { recordDepositAction, type ActionState } from "@/app/actions";
import type { LiveDeposit, LiveStay, PaymentMethodOption } from "@/components/hotel-dashboard";
import { RefundPaymentForm } from "@/components/refund-payment-form";

const money = (kobo: number) => new Intl.NumberFormat("en-NG", {style:"currency",currency:"NGN"}).format(kobo/100);

export function DepositDialog({ stay, deposits, methods, role, onClose }: {
  stay: LiveStay; deposits: LiveDeposit[]; methods: PaymentMethodOption[]; role: string; onClose: () => void;
}) {
  const [state, action, pending] = useActionState(recordDepositAction, {} as ActionState);
  const [key, setKey] = useState("");
  useEffect(() => { setKey(crypto.randomUUID()); }, []);
  const received = deposits.reduce((sum,deposit) => sum + deposit.amountKobo,0);
  const receptionMethods = methods.filter(method => method.name !== "Paystack online");
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="reservation-modal" role="dialog" aria-modal="true" aria-labelledby="deposit-title">
    <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18}/></button>
    <div className="eyebrow">RESERVATION PAYMENT</div><h2 id="deposit-title">Payment for {stay.guest}</h2>
    <p className="modal-subtitle">{stay.room} · {stay.arrival}–{stay.departure}. Deposits are held as a liability until applied to posted charges.</p>
    <div className="folio-total"><span>Deposits received</span><strong>{money(received)}</strong></div>
    {deposits.map(deposit => <div className="folio-section" key={deposit.id}><h3>Advance · {money(deposit.amountKobo)}</h3><p className="modal-subtitle">Unapplied: {money(deposit.amountKobo-deposit.appliedKobo-deposit.refundedKobo)}</p><a className="text-button" href={`/manage/payments/${deposit.paymentId}/receipt`} target="_blank" rel="noreferrer">Print payment receipt</a>{["owner","manager","front_desk"].includes(role) && <RefundPaymentForm paymentId={deposit.paymentId} maxKobo={deposit.amountKobo-deposit.appliedKobo-deposit.refundedKobo}/>}</div>)}
    {state.success ? <div className="modal-success"><h2>Payment recorded</h2><p>The advance is available to apply to this guest’s folio after charges post.</p>{state.result && <a className="button" href={`/manage/payments/${state.result}/receipt`} target="_blank" rel="noreferrer">Print payment receipt</a>}<button className="button button-primary" onClick={onClose}>Done</button></div> : <form action={action} className="reservation-form" style={{marginTop:16}}>
      <input type="hidden" name="reservation_id" value={stay.id}/><input type="hidden" name="idempotency_key" value={key}/>
      <div className="reservation-form-row"><label>Amount received (₦)<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Method<select name="payment_method_id" required>{receptionMethods.map(method => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label></div>
      <label>Reference <span className="optional">Optional</span><input name="reference" placeholder="Transfer or POS reference"/></label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <p className="optional">Record only money actually received. Online payments are added automatically after verification.</p>
      <div className="modal-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={pending || !key || !receptionMethods.length}>Record payment</button></div>
    </form>}
  </section></div>;
}
