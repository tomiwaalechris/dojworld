# Booking release acceptance

## Current release status

The implementation is prepared locally. The new hosted controls require the complete `supabase/dojworld-booking-upgrade.sql` update. No hotel data was changed by the isolated database tests. Email delivery needs a hotel-owned Resend key and a verified sender; scheduled processing needs a production job. Booking.com automatic sync requires the property's actual provider connection.

## Activate the existing Dojworld project

1. In the existing Dojworld Supabase SQL Editor, run the **whole** `supabase/dojworld-booking-upgrade.sql` file. Do not use the fresh installer or historical SaaS migrations. The upgrade is repeatable and preserves existing reservations, money, policies and booking switches.
2. Set `RESEND_API_KEY` and `BOOKING_EMAIL_FROM` on the server after verifying the sending domain in Resend. `.env.local` has placeholders, and its private worker credential is already generated. Copy that credential to the production host securely when deploying; never expose it in browser code or chat.
3. Restart the app, open `/manage#reservations`, and refresh. Confirm the calendar checklist and Booking follow-up load without an update-required notice. The email badge should say credentials configured; this does not prove inbox delivery.
4. Configure the production scheduler to POST `/api/booking/tasks` every minute with `Authorization: Bearer <BOOKING_WORKER_SECRET>`. Keep the real site's HTTPS origin in `SITE_URL`, and set the Paystack test webhook to `/api/paystack/webhook` on a reachable HTTPS host. A localhost callback can verify a payment but cannot receive a Paystack webhook by itself.
5. Identify whether the hotel uses a Booking.com channel manager or Extranet directly. Until its approved connection is set up, follow the manual calendar checks. Do not describe Booking.com as synchronized automatically.

## Hosted acceptance scenarios

Use Paystack test mode, controlled recipients and clearly labelled TEST bookings on vacant future dates. Do not record invented cash, POS or bank receipts in the hotel's real ledger. Clean up unpaid test holds by cancelling them; any test-mode provider money already recorded needs the normal approved test cleanup process rather than deleting financial history.

| Scenario | Expected result |
| --- | --- |
| Phone / WhatsApp booking | Source appears on the same reception reservation; overlapping dates disappear from public availability. |
| Booking.com booking | Reservation number is required; distinct room items support multiple rooms. The same reference/item cannot be entered again, even on another room. |
| Channel collected guest payment | Shows channel payment reported, hotel funds actually received separately; no hotel cash receipt is invented. |
| Guaranteed external reservation | Remains reserved until its actual cancellation/change is handled. It does not expire merely because a channel payout is pending. |
| Temporary unpaid reception hold | Staff agrees a Lagos deadline. After it passes, search/worker releases the room if no receipt exists. A real recorded receipt protects the hold. |
| First-night / full online payment | Server verifies exact amount, currency and reference. One canonical reservation, payment, advance and receipt appear; balance reflects the actual net payment. |
| Callback and webhook repeated | No duplicate receipt, payment journal or confirmation job. |
| Payment after hold expiry | Money is recorded once; payment-review notice appears. No room belonging to another guest is reclaimed. |
| Provider unavailable | Verification error remains visible; do not prompt the guest to pay twice. Recheck can recover after the provider is available. |
| Confirmation email | Run the worker and check provider acceptance plus actual delivery to the controlled inbox. The message contains a reference and recovery link. |
| Recovery in another browser | Correct reference/email sends to the saved email only. Press Open booking to set private access and see current details. A reused or expired link fails. |
| Wrong reference/email | Same generic response as a match; no booking information revealed. |
| Link scanner / email preview | A GET does not consume the token. A guest must submit Open booking. |
| Reception room move / date or status change | Refresh the guest confirmation and verify current room/dates/status, with a queued update email. Original checkout prices and policy remain stored. |
| Failed email | Remains queued/failed, is not counted as accepted. Retry follows the same provider job key; check the provider before manually retrying an old unknown acknowledgement. |
| Provider refund pending/processed/failed | Signed refund notification is rechecked using provider APIs. Pending is not treated as completed; failed remains visible. |
| Missed refund webhook | Check Paystack refunds on the website booking discovers refunds for that exact provider transaction. |
| Refund reconciliation | Completed provider refunds compare with ledger refunds against the exact original payment. Actual refund and independent ledger approval remain separate steps. |
| Calendar acknowledgement race | A room/date/cancellation update made after staff started checking invalidates the stale acknowledgement. |
| Housekeeping / anonymous guest | Cannot read email jobs, payment checks or refund observations; cannot create staff channel bookings or provider financial records. |

## Automated verification performed

- 26 JavaScript checks: validation, signatures, payment totals, navigation, source details, mail transport acceptance, private recovery responses, cookie issuance, worker disconnection and documented refund event handling/pagination.
- Seven rollback database suites using PostgreSQL 16 and the real `pg-safeupdate` extension: online booking, settings, bulk availability, reception payments, complete payment summaries, channel/hold lifecycle, recovery/notifications/refunds.
- A fresh installer, exact replay and additive upgrade compiled and ran successfully.
- Four two-connection races: website/reception overlap, duplicate payment callback, duplicate Booking.com entry, and competing email workers.
- TypeScript, lint and production Webpack compilation; browser checks of the external-booking form, public recovery page and its honest email-not-connected response.

The provider is mocked in transport tests. Local SQL scenarios use synthetic fixtures. These checks do not replace hosted payment/webhook delivery and real email inbox acceptance after connection setup.
