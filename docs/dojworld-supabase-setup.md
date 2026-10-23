# Dedicated Dojworld connection

This is a fresh, single-hotel installation. The public website and staff dashboard use the same room, reservation, folio and payment records. No existing Supabase project is changed by preparing these files. There are no subscription plans, trials, platform owners or paywalls in the dedicated database. Staff permissions remain enforced by PostgreSQL and Supabase Auth.

## 1. Create the fresh Supabase project

Create a project specifically for DOJ World Suites. In that new project's SQL Editor, run the **entire** `supabase/dojworld-install.sql` file as the administrator. Do not run the legacy `supabase/repeatable-install.sql` or push the repository's historical SaaS migrations into this project.

The dedicated installer combines the 19 operations/accounting migrations with Dojworld's booking layer. It is transactional, refuses projects that already contain hotel tables, and makes an exact second application a no-op. A different release is rejected rather than silently replacing a working database. Future schema updates should be reviewed additive migrations. Regenerate the installer with `python3 scripts/build-dojworld-installer.py` when its source changes.

It creates one Dojworld organization and one Lagos property. It seeds four room categories and seven **draft physical-room records** based on the public website. These must be checked against the hotel's actual room inventory. Room listings default to available online; the hotel's global website reservation switch starts off until setup is complete. Rooms start dirty for housekeeping review.

## 2. Add the project connection locally

Copy `.env.example` to `.env.local`. Set:

| Variable | Where to find it / purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The new project's URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The new project's publishable key |
| `SUPABASE_SECRET_KEY` | The project's **server-only secret key** (`sb_secret_...`) |
| `BOOKING_RATE_LIMIT_SECRET` | Generate a random 64-character hex string with `openssl rand -hex 32` |
| `SITE_URL` | `http://localhost:3000` locally; the real HTTPS website origin in production |
| `BOOKING_CLIENT_IP_HEADER` | A client-IP header your hosting platform or trusted proxy **overwrites**, such as `x-forwarded-for` on a properly configured platform |
| `PAYSTACK_SECRET_KEY` | Start with a Paystack **test** secret; leave blank for arrival requests only |

Never put server secrets in `NEXT_PUBLIC_` variables, commit `.env.local`, or paste secrets into chat. Restart the development server after updating environment variables. Configure the same variables in the deployment environment before launch. The server rejects payment initialization from an origin other than `SITE_URL`.

Supabase secret keys bypass RLS and must stay on the server. Public routes call narrowly scoped booking functions; anonymous database clients cannot read guest records or invoke payment-confirmation functions. Staff browser sessions continue to use the publishable key with RLS.

## 3. Set up owner and staff authentication

In Supabase Authentication, turn off public user signups and anonymous sign-ins. Guests do not need an account to book. Create/invite the owner through the Supabase Authentication user interface and ensure their email is confirmed. Check the quoted owner email in `supabase/dojworld/assign-owner.sql`, then run the single statement in a new SQL Editor query in the new project. It assigns this existing Auth user to Dojworld as the owner.

Set the Auth Site URL to the current website origin and allow the `/auth/confirm` and `/auth/update-password` redirects. For invitation emails, use a template link of:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/update-password
```

The owner signs in at `/auth/login` and accesses `/manage`. Other staff must have an Auth account created/invited through Supabase by the project administrator, then accept the property-scoped invitation created by the owner under Staff. The existing staff invitation feature creates a link for manual sharing; it does not send an Auth invitation email. Keep the project administrator's access separate from routine hotel staff access.

## 4. Verify inventory and enable the website

For an existing dedicated installation, run the entire `supabase/dojworld-booking-upgrade.sql` file in Supabase SQL Editor to add bulk room controls, reception payment collection, channel tracking, temporary hold deadlines, recovery/email queues and payment/refund follow-up. It is additive and repeatable, retains all records and existing paused listings, and includes the earlier settings-save fix. Regenerate both install and upgrade files with `python3 scripts/build-dojworld-installer.py` after changing their SQL sources. The browser application can show the new controls before this database update is installed; the update must be applied before using them.

If saving booking settings reports **UPDATE requires a WHERE clause**, run the entire `supabase/dojworld/fix-booking-settings.sql` file in the existing project's SQL Editor, then retry the save. This additive patch replaces only the settings-save function and retains owner checks, saved settings and inventory. Do not rerun the fresh installer on an existing project to apply this correction.

In the staff dashboard:

1. In Settings, review Hotel information, Room Types, Rooms, Rates, and Payment Methods. Replace draft room records with the actual physical room inventory. Check each room's guest capacity and prices. Housekeeping should inspect room readiness.
2. Under **Website booking connection → Online room availability**, map each public named room to its actual active hotel room. Each physical room can be assigned to only one listing. Listings default to available online. Select individual rows or **Select all rooms**, then **Make available online** or **Pause online bookings** to update listings together. Pausing stops new online sales and preserves existing reservations. This release sells one mapped physical room per named listing; room-type pools or multi-room/group bookings need a separate extension.
3. Enter the actual cancellation/refund policy. The placeholder cannot be used to enable sales. The agreed policy is stored on each booking and shown on the guest confirmation page.
4. Public checkout uses final, tax-inclusive room prices. Separate mandatory tax rules are not calculated by this web checkout; the booking layer refuses new checkout creation while active nonzero separate tax rules are configured. Optional extras added by reception remain separate folio charges.
5. Decide whether to allow **requests** to pay at the hotel. These reserve no inventory until reception approves them.
6. Enable website reservations only once the server connection and policies are ready.

## 5. Connect Paystack in test mode

Use a Paystack account belonging to the hotel and set its test secret on the server. Configure the test webhook URL:

```
https://YOUR_WEBSITE/api/paystack/webhook
```

Paystack needs a publicly reachable HTTPS URL for webhooks; localhost alone cannot receive them. The application supplies a callback URL under `/booking/return` during transaction initialization. Run test payments before using live keys. Switching to a live key also requires the live webhook configuration. Do not enter real card data in a test flow.

The server initializes transactions with the database-calculated amount and unique reference. It validates the raw webhook signature, re-verifies successful payments with Paystack, and checks reference, currency and amount before posting a receipt. Both the callback and webhook can confirm the same payment without duplicating accounting entries. No card details are stored by this application.

An unpaid checkout reserves the physical room for 15 minutes using an `inquiry` reservation in the same inventory used by reception. Verification confirms the reservation and records all money received as a guest advance liability, credited to that guest's folio. Room revenue continues to be recognized through the existing stay lifecycle. Full payment online is also an advance until the room charges are earned.

A failed checkout initialization can be retried with the same attempt/reference. If a provider response is lost after initialization, the old hold eventually expires; do not create a second manual transfer to fix it. A late payment is recorded once and flagged for staff review, without taking a room already reserved by someone else.

## 6. Reception workflow

Room listing status is independent of availability for dates. Leave listings available online during normal operation. Website holds, confirmed reception reservations, in-house stays and inventory-blocking maintenance automatically remove overlapping dates from public availability. Cancellation or expired unpaid holds release those dates; reception does not need to re-enable the listing after each stay.

When creating a reservation, reception selects **Unpaid** or **Payment received**. For payment received, enter the actual amount, active reception method (cash, bank transfer or POS) and reference. The stay and initial receipt save in one transaction and the same attempt can safely be retried. Invalid payments leave no partially created stay. Initial receipts are guest advances until charges are earned; full prepayment is still an accounting advance. The Paystack online method is reserved for verified gateway transactions and cannot be posted manually by staff.

Reservations and Front Desk show reservation status separately from **Unpaid**, **Part paid**, **Room paid in full** or **Refunded**. Amounts are derived from complete recorded receipts minus actual refunds, with the payment methods and latest receipt link. A room balance refers to the agreed accommodation quote; extra folio services remain separate. Missing financial data is shown as unavailable, never assumed unpaid.

An unpaid reservation produces a printable **Booking confirmation**. A recorded receipt produces a printable **Payment receipt** with a unique payment-based number, guest and stay details, amount, method, reference, timestamp and collector. Both documents require authorized hotel staff access. Later advances and folio payments provide individual receipt links too. Booking cancellation does not itself issue or record a refund.

Reservations now includes **Website reservations**. The list refreshes every 15 seconds while visible; the staff dashboard reloads hotel records every 20 seconds. Manual refresh is also available. This is polling, so Supabase Realtime publication setup is not required.

- **Paid online:** the confirmed stay and advance appear in the existing reservation/folio records. Reception collects any remaining balance against that same reservation.
- **Pay-at-hotel request:** contact the guest, agree a payment/arrival deadline, record it and the contact note, then approve. Approval rechecks current availability and rates before creating the confirmed stay. Requests can also be declined.
- **Deadline passed:** unpaid holds are released on availability searches, subsequent staff bookings, guest status checks and staff dashboard loads. Any receipt recorded at reception or a checked-in stay prevents automatic cancellation. No background cron is required for correct selling availability.
- **Payment review:** a payment arrived after the hold expired or the room became unavailable. Contact the guest to arrange a room or refund through Paystack. Record the corresponding refund in the hotel ledger using the existing authorized refund workflow. The application does not automatically send refunds or send money through Paystack.

Guests receive a browser confirmation/status page and reference. A private HttpOnly cookie is required to open its details in the same browser. The page rechecks pending payments and shows deposits, remaining balance, hotel decisions, deadlines and cancellations. Guests can save/print the page. Guests can also use **Find your booking** to request a one-use recovery link sent to the original booking email. Confirmation and stay-change emails are queued transactionally. Sending requires the email setup and scheduled worker below. SMS and WhatsApp delivery are not connected; staff contact through those channels is manual.

## Verification completed locally

- Dedicated installer compiles against PostgreSQL with test Supabase Auth/Storage schemas; no SaaS tables are installed.
- Real database tests cover offline defaults, live rate schedules, saved nightly prices, shared room holds, deposit accounting, receipt idempotency, late payments, guest token privacy, staff approval, rate limiting and actual RLS role checks.
- Concurrent website/reception attempts produce one booking and one rejected conflict. Concurrent callback/webhook confirmations produce one payment, one deposit, and one balanced posted journal.
- JavaScript checks cover date and checkout validation, exact payment references/currencies and raw webhook signatures.
- The booking-settings regression check reproduces the missing-filter error with `pg-safeupdate` loaded, then verifies the patched owner save, booking enablement, audit records, policy validation and rejection of housekeeping changes. Run `scripts/test-dojworld-booking-settings.sql` on the disposable local database with that extension loaded in the same connection; its changes roll back.
- TypeScript and the production Webpack build are checked separately.

The existing hosted hotel connection and staff login remain in use, but new features need the additive SQL upgrade. Local database and mocked provider checks do **not** prove email delivery or hosted webhook delivery. Complete the acceptance checklist in `docs/booking-acceptance.md` after applying the SQL and connecting the sender/scheduler.

## Local test commands

```
node --test scripts/online-booking.test.cjs scripts/payment-summary.test.cjs scripts/pms-navigation.test.cjs scripts/booking-connections.test.cjs
npm run typecheck
npx next build --webpack
```

Run `scripts/test-dojworld-booking.sql` on a disposable local dedicated database after applying the installer. It rolls its scenarios back. `scripts/test-dojworld-concurrency.py` refuses a database containing reservations or Auth users, accepts only localhost or `/tmp`, and leaves synthetic fixtures for inspection. Set `DOJ_TEST_PGHOST` and `DOJ_TEST_PGPORT` for that local cluster. The development verification used port 55439, separate from all hosted and normal Supabase project connections.


## 7. Phone, WhatsApp and external booking channels

Choose the source when creating a reception reservation. Booking.com requires its reservation number; for a multi-room external booking, enter each physical room with a distinct room item reference (1, 2, etc.). The same Booking.com reference/item cannot be entered twice, even on different rooms or by simultaneous staff. The quoted channel price must be approved through the existing manager pricing controls if it differs from scheduled rates.

External booking payment collection has its own field. **Channel reports collecting payment** never creates a hotel payment or cash receipt. Verify the payout before recording funds received, and avoid asking the guest to pay the same amount again. The dashboard and confirmation document distinguish reported channel collection from actual hotel receipts.

Confirmed external bookings are guaranteed and do not automatically expire for nonpayment. Phone, WhatsApp and reception reservations may be guaranteed or temporary unpaid holds, with a future deadline no later than arrival day in Lagos time. A recorded receipt immediately removes a temporary hold deadline. Without a receipt, expiry cancels the hold under the same inventory lock used by website/reception booking creation.

**Automatic Booking.com synchronization is not connected.** A public listing URL or reservation number is not sufficient API access. Confirm the property's current channel manager or approved connectivity provider and activate its connection/scopes in the Extranet. See the [official connection overview](https://developers.booking.com/connectivity/docs/connections-api/connections-overview). Until then, reception must enter Booking.com reservations promptly and update the Extranet calendar after website/reception bookings, changes and cancellations. The Reservations checklist records a manual calendar check and rejects acknowledgements made against an outdated task version. Room closures, maintenance, rate changes and changes made in the Extranet also require manual attention. This checklist is not an API sync guarantee and cannot prevent a booking arriving in Booking.com before staff updates its calendar.

## 8. Prepare the booking email connection

The server uses [Resend's email API](https://resend.com/docs/api-reference/emails/send-email). Create a hotel-owned Resend account, verify the hotel's sending domain using the DNS records Resend provides, and create a sending API key. Configure these **server-only** variables locally and on the production host:

```
RESEND_API_KEY=<hotel sending key>
BOOKING_EMAIL_FROM=Dojworld <reservations@YOUR_VERIFIED_DOMAIN>
BOOKING_WORKER_SECRET=<a random secret of at least 32 characters>
```

Local placeholders and a private worker secret are prepared in `.env.local`; no email key or verified sender has been supplied. A nonempty key/sender means credentials are configured, not that delivery has been verified. Restart the app after adding them. Use a controlled test recipient first and inspect Resend's accepted/delivered/bounced events. The application records provider acceptance; it does not claim inbox delivery or currently ingest bounce events. Resend idempotency keys last 24 hours; retries use the same job key and message snapshot. Manual retries of a message whose provider acknowledgement was lost more than 24 hours ago may duplicate it, so check the provider before retrying old stalled jobs.

The durable outbox queues website request acknowledgements, confirmations, declines, cancellations, expired holds, payment-review notices and current stay changes. Staff-created phone/WhatsApp bookings continue to use printable confirmations and manual guest contact. A database transaction's related stay changes coalesce into one final snapshot. Failed jobs retry up to five attempts; staff can queue a failed/stalled job for retry in Booking follow-up. Without email credentials, jobs remain pending and recovery clearly explains the missing connection.

Guests open `/booking/recover` with their reference and booking email. All valid submissions get the same generic response whether a match exists or delivery fails. A match sends only to the saved email, with a hashed, one-use link valid for 20 minutes. Link previews cannot consume it: the guest must press **Open booking**, which posts the token and creates a 30-day HttpOnly recovery session. The original browser's access remains valid. Tokens are removed from the visible address bar and recovery pages send no referrer.

### Scheduled processing

Configure the production host's scheduler to make an authenticated **POST** every minute:

```
https://YOUR_WEBSITE/api/booking/tasks
Authorization: Bearer <BOOKING_WORKER_SECRET>
```

A configured worker secret only prepares the endpoint. No production scheduler is created by this code. The worker releases due holds, claims up to three initialized online payments for provider re-verification (10-minute backoff, seven-day lookback), refreshes up to three known pending/processing refunds, and processes up to three emails. Select a host timeout of at least 120 seconds. Staff can run the same batch with **Process booking updates**. Inventory searches also expire due holds, so selling correctness does not depend on a timely worker run. Provider failures are recorded for reception follow-up, not treated as paid.

## 9. Payment and refund follow-up

The website booking list has **Recheck payment with Paystack** for unpaid online attempts and **Check Paystack refunds** for verified payments. The latter reads every refund page for the original transaction, so it can discover missed refund webhooks. The signed webhook handles Paystack's documented refund events by requerying the original transaction's refunds; it does not trust the webhook amount as a ledger posting. Known pending/processing/needs-attention refunds can also be rechecked individually or by the worker.

Booking follow-up compares **processed provider refunds** with the complete ledger refunds against that exact original online payment. It displays pending/failed refunds separately and never creates cash or silently posts a refund. Complete the actual refund in Paystack, then use the existing staff request and independent manager approval workflow to record it in the hotel ledger. Canceling a stay alone does not refund it. Provider fees, bank settlements, chargebacks and channel commissions still require the hotel's regular accounting reconciliation; they are not automatically imported by this feature.

Guest confirmations show the current assigned room, planned dates, adults, actual departure when recorded, net payments and reservation state while preserving original checkout prices/policy snapshots. They refresh while visible and have a manual refresh button. After checkout, the guest folio remains the source for final charges and extra services; an accommodation quote is not a final tax invoice.
