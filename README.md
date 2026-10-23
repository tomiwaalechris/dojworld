# DOJ World Suites

Dojworld's public hotel website and private hotel management system share one dedicated Supabase database. Public pages are `/`, `/about`, `/rooms`, `/experience`, `/gallery`, and `/contact`; staff sign in at `/auth/login` and work at `/manage`.

## Connect the fresh hotel project

Follow [the dedicated setup guide](docs/dojworld-supabase-setup.md). Run `supabase/dojworld-install.sql` in the **new project's SQL Editor**, create the owner's Auth account, assign it with `supabase/dojworld/assign-owner.sql`, and configure `.env.local` from `.env.example`. Never install the historical SaaS bundle in this dedicated project.

The new installer contains hotel operations, finance, staff access, inventory, rates, online reservations, and verified payment handling. Subscription billing and platform administration are not part of this installation. Existing SaaS source files and migrations are retained as historical material; `/platform` and `/subscription` now lead to the hotel workspace.

Online room listings default to available; the hotel's overall booking switch starts off until setup is complete. Review the draft physical rooms, final rates, website mappings, cancellation policy and Paystack test connection before enabling website reservations. Settings includes bulk controls to list or pause rooms while existing reservations continue to block their dates automatically.

Existing dedicated projects can apply `supabase/dojworld-booking-upgrade.sql` to add bulk controls, atomic front-desk reservation payments, authoritative payment summaries, printable confirmations/receipts, channel tracking, hold deadlines, booking recovery/email queues and payment/refund follow-up. The update preserves existing records, booking settings and paused listings.

## Booking options

- Online first-night deposit or full payment: a 15-minute checkout hold becomes a confirmed reservation after server verification.
- Pay at the hotel: a request requiring reception approval and an agreed deadline.
- One room inventory protects both online and reception bookings. Payments are credited to the guest folio and posted as advances until earned.
- Reception explicitly records unpaid or payment received, with amount and method. Unpaid bookings produce confirmations; actual receipts produce payment documents. Reservation status and net payment status are shown separately.

Guest confirmations follow current reception records and support one-use email recovery. Resend delivery is prepared and needs a verified sender/key plus scheduled processing. SMS/WhatsApp delivery and automatic Booking.com sync remain unconnected. Reception can enter bookings from each channel into the shared inventory and record manual Extranet calendar checks. Late payments go to reception review. See [the acceptance checklist](docs/booking-acceptance.md) for hosted setup and tests.

## Develop and verify

```
npm install
npm run dev
node --test scripts/online-booking.test.cjs scripts/payment-summary.test.cjs scripts/pms-navigation.test.cjs scripts/booking-connections.test.cjs
npm run typecheck
npx next build --webpack
```

The website can be previewed without project credentials; online bookings then remain unavailable and the staff dashboard clearly shows sample data. See the dedicated setup guide for database integration and concurrency tests and the distinction between local verification and hosted/payment acceptance.
