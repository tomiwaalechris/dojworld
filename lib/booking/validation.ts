export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TOKEN = /^[0-9a-f]{64}$/;
export function lagosToday(now = new Date()) { return new Intl.DateTimeFormat("en-CA", {timeZone:"Africa/Lagos",year:"numeric",month:"2-digit",day:"2-digit"}).format(now); }
export function validDate(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
export function stayError(arrival: unknown, departure: unknown, guests: unknown, today?: string) {
  if (!validDate(arrival) || !validDate(departure)) return "Choose valid check-in and check-out dates.";
  today ??= lagosToday();
  const nights = (Date.parse(departure) - Date.parse(arrival))/86400000;
  if (arrival < today || Date.parse(arrival)>Date.parse(today)+365*86400000 || nights<1 || nights>30) return "Choose one to 30 nights, arriving within the next year.";
  if (guests!==1 && guests!==2) return "Choose one or two guests.";
  return null;
}
export type CheckoutInput = { id: string; token: string; slug: string; arrival: string; departure: string; guests: number; name: string; email: string; phone: string; plan: "deposit" | "full" | "arrival"; expectedTotal: number; expectedPolicy: string; acceptedPolicy: boolean };
export function checkoutError(body: CheckoutInput) {
  if (!body || typeof body!=="object" || !UUID.test(body.id ?? "") || !TOKEN.test(body.token ?? "")) return "Start a new booking attempt.";
  const dates = stayError(body.arrival,body.departure,body.guests); if (dates) return dates;
  if (typeof body.slug!=="string" || !/^[a-z-]{3,70}$/.test(body.slug)) return "Choose a room.";
  if (typeof body.name!=="string" || body.name.trim().length<2 || body.name.length>100 || typeof body.email!=="string" || body.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || typeof body.phone!=="string" || !/^\+?[\d ()-]{7,30}$/.test(body.phone)) return "Enter your name, email and a valid phone number.";
  if (!["deposit","full","arrival"].includes(body.plan) || !Number.isSafeInteger(body.expectedTotal) || body.expectedTotal<=0 || body.acceptedPolicy!==true || typeof body.expectedPolicy!=="string" || body.expectedPolicy.length<30 || body.expectedPolicy.length>3000) return "Choose your payment option and accept the hotel's booking terms.";
  return null;
}
export function verifiedTransaction(data: unknown, reference: string): data is { status: "success"; reference: string; amount: number; currency: "NGN" } {
  if (!data || typeof data!=="object") return false;
  const t=data as Record<string,unknown>;
  return t.status==="success" && t.reference===reference && t.currency==="NGN" && typeof t.amount==="number" && Number.isSafeInteger(t.amount) && t.amount>0;
}
