import "server-only";
import { bookingClient, BookingError, paystack, rpcError } from "./server";

export async function refreshBookingRefunds(reference: string) {
  if (!/^DOJ-[a-f0-9]{32}$/.test(reference)) throw new BookingError("Invalid payment reference.");
  const transaction = await paystack(`transaction/verify/${reference}`);
  if (!Number.isSafeInteger(transaction.id) || transaction.id <= 0 || transaction.reference !== reference) throw new BookingError("The provider transaction could not be matched.", 502);
  // Read every page so partial refunds cannot disappear behind a UI row limit.
  for (let page = 1; page <= 50; page++) {
    const rows = await paystack(`refund?transaction=${transaction.id}&perPage=100&page=${page}`);
    if (!Array.isArray(rows)) throw new BookingError("The provider refund list could not be read.", 502);
    for (const refund of rows) {
      if (String(typeof refund.transaction === "object" ? refund.transaction?.id : refund.transaction) !== String(transaction.id)) throw new BookingError("A provider refund belongs to a different transaction.", 502);
      const { error } = await bookingClient().rpc("record_booking_provider_refund", { p_provider_id: String(refund.id), p_reference: reference, p_amount: refund.amount, p_currency: refund.currency, p_status: refund.status });
      if (error) rpcError(error);
    }
    if (rows.length < 100) return;
  }
  throw new BookingError("There are too many refund pages to finish this check. Contact the hotel administrator.", 503);
}

export async function refreshProviderRefund(id: string) {
  if (!/^[0-9]{1,25}$/.test(id)) throw new BookingError("Invalid refund reference.");
  const refund = await paystack(`refund/${id}`);
  if (String(refund.id) !== id) throw new BookingError("The provider returned a different refund.", 502);
  const transaction = typeof refund.transaction === "object" && refund.transaction !== null
    ? refund.transaction : await paystack(`transaction/${encodeURIComponent(String(refund.transaction))}`);
  if (typeof transaction?.reference !== "string" || !/^DOJ-[a-f0-9]{32}$/.test(transaction.reference)) return;
  const { error } = await bookingClient().rpc("record_booking_provider_refund", {
    p_provider_id: id, p_reference: transaction.reference, p_amount: refund.amount, p_currency: refund.currency, p_status: refund.status,
  });
  if (error) rpcError(error);
}
