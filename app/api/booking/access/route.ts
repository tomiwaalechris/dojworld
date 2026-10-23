import { createHash, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { assertOrigin, BookingError, bookingClient, errorResponse, privateJson, rateLimit, readBody, rpcError, setBookingCookie } from "@/lib/booking/server";
export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    const body = await readBody(request);
    if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token)) throw new BookingError("This recovery link is invalid. Request another link.");
    await rateLimit(request, "recovery-access", 10, 900);
    const session = randomBytes(32).toString("hex");
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const { data, error } = await bookingClient().rpc("consume_booking_recovery", { p_token_hash: hash(body.token), p_session_hash: hash(session) });
    if (error) throw new BookingError(error.code === "P0002" ? "This link expired or was already used. Request a new link to open your booking." : "Booking access is temporarily unavailable.", error.code === "P0002" ? 410 : 503);
    if (typeof data !== "string") rpcError({ message: "Invalid recovery response" });
    return setBookingCookie(privateJson({ url: `/booking/return?id=${data}` }), data, session);
  } catch (error) { return errorResponse(error); }
}
