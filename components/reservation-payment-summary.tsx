import Link from "next/link";
import { money } from "@/lib/dojworld";
import { roomBalance, roomPaymentStatus, type ReservationPaymentSummary as Summary } from "@/lib/booking/payment-summary";

export function ReservationPaymentSummary({ summary, state, receipt = true, channelCollection }: { summary?: Summary; state?: string; receipt?: boolean; channelCollection?: string }) {
  if (!summary) return <div className="reservation-payment-summary"><small className="sub-cell">Payment details unavailable</small></div>;
  const status = roomPaymentStatus(summary);
  const inactive = ["cancelled", "no_show", "rejected", "expired", "payment_review"].includes(state ?? "");
  const channelReported=channelCollection==="collected_by_channel"&&summary.netPaidKobo<summary.roomTotalKobo;
  const label = inactive && summary.netPaidKobo > 0 ? "Funds received" : channelReported ? "Channel payment reported" : status.label;
  return <div className="reservation-payment-summary">
    <span className={`status-pill ${inactive && summary.netPaidKobo > 0 ? "amber-pill" : status.tone}`}>{label}</span>
    <small>{channelReported?"Hotel received":"Net paid"} {money(summary.netPaidKobo / 100)}</small>
    {!inactive && <small title="Accommodation quote less payments after refunds. Extra folio charges are separate.">{channelReported?"Channel payout / balance to verify":"Room balance"} {money(roomBalance(summary) / 100)}</small>}
    {summary.paymentMethods.length > 0 && <small>{summary.paymentMethods.join(" · ")}</small>}
    {summary.refundedKobo > 0 && <small>Refunded {money(summary.refundedKobo / 100)}</small>}
    {receipt && summary.latestPaymentId && <Link className="text-button" href={`/manage/payments/${summary.latestPaymentId}/receipt`} target="_blank" rel="noreferrer">View receipt</Link>}
  </div>;
}
