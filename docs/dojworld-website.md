# Current connection status

The website now includes a real booking API, checkout and confirmation pages, reception approval controls and a dedicated single-hotel installer. Connection to a new hosted Supabase project and Paystack test checkout still require configuration. Follow [the fresh-project setup guide](dojworld-supabase-setup.md). The initial WhatsApp-enquiry implementation described below has been replaced for room booking; the general WhatsApp contact link remains.

---

# Dojworld website rebuild

The public website is `/`. The existing staff application moved to `/manage`, with login, setup, property switching, invitations, subscription links and mutation revalidation updated accordingly. Existing authentication and property access checks are retained. Without Supabase configuration, the staff application retains its clearly labelled sample-data mode.

## Current public experience

Responsive landing page, hotel story, seven room listings, category filters, date selection, nightly estimates, room dialogs, gallery lightbox, contact and map links. Guests can prepare a reservation enquiry and review it in WhatsApp before sending. No enquiry is recorded in the PMS, no inventory is held, and no booking is confirmed or payment collected by the public website.

## Source content and assets

Retrieved from https://dojworld.com/ and https://dojworld.com/amenities-2-2/ on 22 October 2026. Original public logo and photographs are stored under `public/dojworld/`. Room names, categories, published nightly rates, amenities and contact details were taken from the existing website. Descriptive marketing copy was rewritten for the new design. Room prices need hotel confirmation before launch.

Original asset paths, all relative to https://dojworld.com/wp-content/uploads/:

- `2023/12/New-Project-22.png` → logo.png
- `2024/02/New-Project-19.webp` → suite.webp
- `2024/04/IMG_129722-1536x1024.jpg` → lounge.jpg
- `2024/04/New-Project-46.png` → interior.png
- `2024/04/New-Project-23-500x500.png` → mambilla.png
- `2024/04/IMG-20240409-WA0104-500x500.jpg` → tinapa.jpg
- `2024/04/New-Project-33-500x500.png` → ikogosi.png
- `2024/04/New-Project-39-500x500.png` → yankari.png
- `2024/04/New-Project-44-500x500.png` → olumo.png
- `2024/04/New-Project-50-500x500.png` → zuma.png
- `2023/12/New-Project-54-500x500.png` → obudu.png

## Remaining before live online bookings

Bind the public catalogue to Dojworld's actual property and room-type IDs; implement a public server-side availability endpoint that returns only sellable room categories and rates; create atomic expiring holds against the same inventory as walk-ins; configure a payment provider and verified, idempotent webhooks; create confirmed reservations from verified payment events; deliver confirmations; agree taxes, cancellation, refund and guest privacy policies. Do not expose staff Supabase permissions or relax reservation RLS for anonymous users.

The current implementation is a local preview, not a deployment or a replacement of the existing live website.

## Multipage update — 22 October 2026

The public website now uses the same locally hosted Geist font as the staff dashboard, including headings, captions, wordmark text and footer. Public pages are `/`, `/about`, `/rooms`, `/experience`, `/gallery`, and `/contact`. Each room has a dedicated `/rooms/<room-name>` page. Shared navigation uses actual page URLs, active-page indicators and breadcrumbs. Date and guest selections travel to room pages in the URL and prefill reservation enquiries.

Additional content was checked against the original About page, Contact page (`https://dojworld.com/contact-us/`), Gallery (`https://dojworld.com/gallery/`) and Mambilla Plateau page (`https://dojworld.com/room/the-mambilla-plateau/`). Contact now includes the published 24/7 Monday–Sunday opening hours and `info@dojworld.com`. The gallery retains the original Facilities, Restaurant & bar, and Rooms categories. The original About page contains empty Mission/Vision headings; no mission or vision statements were invented.

Additional gallery assets from the original upload directory:

- `2023/12/New-Project-5.jpg` → facilities.jpg
- `2024/04/New-Project-36.png` → facilities-interior.png
- `2024/04/New-Project-37.png` → facilities-detail.png
- `2024/03/IMG_1299-scaled.jpg` → restaurant.jpg
- `2024/04/IMG_1305-scaled.jpg` → dining.jpg
- `2023/12/New-Project-62.png` → bar.png

Validation: TypeScript and production build (`next build --webpack`) passed. Browser checks covered page navigation, gallery filters, a room enquiry retaining three selected nights, and mobile navigation at 390px with no horizontal overflow on Contact. The standard Turbopack production build previously encountered a local process permission limitation, so Webpack remains the verified production build path.
