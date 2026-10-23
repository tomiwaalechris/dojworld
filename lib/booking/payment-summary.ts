export type ReservationPaymentSummary = {
  roomTotalKobo: number;
  grossPaidKobo: number;
  refundedKobo: number;
  netPaidKobo: number;
  paymentMethods: string[];
  latestPaymentId: string | null;
};

export type PaymentSummaryRow = {
  reservation_id: string;
  room_total_kobo: number | string;
  gross_paid_kobo: number | string;
  refunded_kobo: number | string;
  net_paid_kobo: number | string;
  payment_methods: string[] | null;
  latest_payment_id: string | null;
};

export function parsePaymentSummary(row: PaymentSummaryRow): ReservationPaymentSummary | undefined {
  const [roomTotalKobo, grossPaidKobo, refundedKobo, netPaidKobo] = [
    row.room_total_kobo, row.gross_paid_kobo, row.refunded_kobo, row.net_paid_kobo,
  ].map(Number);
  if (![roomTotalKobo, grossPaidKobo, refundedKobo, netPaidKobo].every(value => Number.isSafeInteger(value) && value >= 0)
    || refundedKobo > grossPaidKobo || netPaidKobo !== grossPaidKobo - refundedKobo) return;
  return { roomTotalKobo, grossPaidKobo, refundedKobo, netPaidKobo,
    paymentMethods: row.payment_methods ?? [], latestPaymentId: row.latest_payment_id };
}

export function roomPaymentStatus(summary: ReservationPaymentSummary) {
  if (summary.grossPaidKobo > 0 && summary.netPaidKobo === 0) return { label: "Refunded", tone: "amber-pill" };
  if (summary.roomTotalKobo === 0 && summary.netPaidKobo === 0) return { label: "Complimentary", tone: "green-pill" };
  if (summary.netPaidKobo === 0) return { label: "Unpaid", tone: "amber-pill" };
  if (summary.netPaidKobo < summary.roomTotalKobo) return { label: "Part paid", tone: "blue-pill" };
  return { label: "Room paid in full", tone: "green-pill" };
}

export function roomBalance(summary: ReservationPaymentSummary) {
  return Math.max(summary.roomTotalKobo - summary.netPaidKobo, 0);
}
