import { randomBytes, createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { assertOrigin, BookingError, bookingClient, errorResponse, privateJson, rateLimit, readBody, rpcError, siteOrigin } from "@/lib/booking/server";
import { emailReady, sendBookingEmail } from "@/lib/booking/email";

export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    const body = await readBody(request);
    const reference = String(body.reference ?? "").trim().toLowerCase();
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!/^doj-[a-f0-9]{32}$/.test(reference) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BookingError("Enter your full DOJ booking reference and booking email address.");
    if (!emailReady()) throw new BookingError("Booking recovery email is being connected. Please call reception with your reference for help.", 503);
    await rateLimit(request, "recovery", 5, 900);
    await rateLimit(request, "recovery-booking", 3, 900, `${reference}:${email}`);
    const token = randomBytes(32).toString("hex");
    const { data, error } = await bookingClient().rpc("prepare_booking_recovery", { p_reference: reference, p_email: email, p_token_hash: createHash("sha256").update(token).digest("hex") });
    if (error) rpcError(error);
    if (data) {
      // The same response is returned even if delivery fails, so this endpoint never confirms a guest's identity.
      await sendBookingEmail(data.email, "Open your Dojworld booking", `Open your booking using this private link:\n${siteOrigin()}/booking/access?token=${token}\n\nThe link expires in 20 minutes and can be used once. Press Open booking on the page to continue.\nIf you did not request this, ignore this email.\nDojworld reception: +234 913 389 8066`, `recovery-${createHash("sha256").update(token).digest("hex")}`).catch(() => undefined);
    }
    return privateJson({ message: "If the reference and email match, a private link will arrive shortly. Check your spam folder, or contact reception if it does not arrive." });
  } catch (error) { return errorResponse(error); }
}
