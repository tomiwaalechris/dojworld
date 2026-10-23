import "server-only";

export function emailReady() {
  return Boolean(process.env.RESEND_API_KEY && process.env.BOOKING_EMAIL_FROM && /^[^\r\n]+@[^\r\n]+$/.test(process.env.BOOKING_EMAIL_FROM));
}

export async function sendBookingEmail(to: string, subject: string, text: string, key: string) {
  if (!emailReady()) throw new Error("Hotel email delivery is not connected yet.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ from: process.env.BOOKING_EMAIL_FROM, to: [to], subject, text }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data?.id !== "string") throw new Error("The email provider did not accept this message. Check the sender connection and retry.");
  return data.id as string;
}

const subjects: Record<string, string> = {
  requested: "We received your booking request", confirmed: "Your booking is confirmed",
  expired: "Your unpaid booking hold expired", rejected: "An update on your booking request",
  cancelled: "Your booking was cancelled", payment_review: "Payment received: please contact reception",
  stay_updated: "Your stay details have changed",
};
export function notificationEmail(kind: string, payload: Record<string, unknown>, origin: string) {
  const subject = subjects[kind] ?? "An update on your Dojworld booking";
  const explanation = kind === "requested" ? "Reception must approve your request before a room is reserved."
    : kind === "payment_review" ? "Your payment is recorded, but your room is not confirmed. Contact reception to arrange accommodation or a refund. Do not pay again."
    : kind === "expired" ? "The unpaid hold deadline passed and the room was released. If you already paid, contact reception with your reference. Do not pay again."
    : kind === "stay_updated" ? "Reception updated your stay. Open your booking to see the latest room, dates and payments."
    : kind === "confirmed" ? "Your reservation is confirmed. We look forward to welcoming you."
    : "Please contact reception if you need assistance. Cancellation does not itself confirm a refund.";
  return { subject: `${subject} | Dojworld`, text: [subject, "", explanation, "", `Reference: ${payload.reference}`,
    `Room: ${payload.room}`, `Arrival: ${payload.arrival}`, `Departure: ${payload.departure}`,
    `Stay status: ${String(payload.reservationStatus ?? payload.state).replaceAll("_", " ")}`, "",
    `Find your booking securely: ${origin}/booking/recover`, "Use this reference and the email address used to book.", "",
    "This message describes the hotel records at the time of this update. Open your booking for the latest details.",
    "Dojworld reception: +234 913 389 8066"].join("\n") };
}
