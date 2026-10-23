import "server-only";
import { bookingClient, rpcError, siteOrigin, verifyPayment } from "./server";
import { emailReady, notificationEmail, sendBookingEmail } from "./email";
import { refreshProviderRefund } from "./reconciliation";

export async function runBookingTasks() {
  const client = bookingClient();
  const { data: settings, error: settingsError } = await client.from("dojworld_settings").select("property_id").eq("singleton", true).single();
  if (settingsError) rpcError(settingsError);
  const { error: expiryError } = await client.rpc("release_expired_online_bookings", { p_property_id: settings!.property_id });
  if (expiryError) rpcError(expiryError);
  const { data: checks, error: checksError } = await client.rpc("claim_booking_payment_checks", { p_limit: 3 });
  if (checksError) rpcError(checksError);
  const verification = await Promise.allSettled((checks ?? []).map((row: { payment_reference: string }) => verifyPayment(row.payment_reference)));
  const { data: refunds, error: refundError } = await client.from("booking_provider_refunds").select("provider_id").in("provider_status", ["pending", "processing", "needs-attention"]).lt("checked_at", new Date(Date.now()-600000).toISOString()).order("checked_at").limit(3);
  if (refundError) rpcError(refundError);
  await Promise.allSettled((refunds ?? []).map(row => refreshProviderRefund(row.provider_id)));
  let accepted = 0; let failed = 0;
  if (emailReady()) {
    const { data: messages, error } = await client.rpc("claim_booking_notifications", { p_limit: 3 });
    if (error) rpcError(error);
    for (const job of messages ?? []) {
      const content = notificationEmail(job.kind, job.payload, siteOrigin());
      let provider: string | null = null;
      try { provider = await sendBookingEmail(job.recipient, content.subject, content.text, `booking-notification-${job.id}`); }
      catch { failed++; }
      const { error: finishError } = await client.rpc("finish_booking_notification", { p_id: job.id, p_lease: job.lease_id, p_success: Boolean(provider), p_provider: provider, p_error: provider ? null : "Email provider rejected or timed out. Verify sender settings and retry." });
      if (finishError) rpcError(finishError);
      if (provider) accepted++;
    }
  }
  return { emailConnected: emailReady(), accepted, failed, paymentsChecked: verification.filter(row => row.status === "fulfilled").length, paymentErrors: verification.filter(row => row.status === "rejected").length };
}
