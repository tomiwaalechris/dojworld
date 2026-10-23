import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { limitKey } from "./security";
import { TOKEN, UUID, verifiedTransaction } from "./validation";

export class BookingError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function bookingClient() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret || !/^[a-f0-9]{64}$/i.test(process.env.BOOKING_RATE_LIMIT_SECRET??"")) throw new BookingError("Online reservations are being prepared. Please contact reception to book.",503);
  return createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function siteOrigin() {
  const value=process.env.SITE_URL || (process.env.NODE_ENV!=="production" ? "http://localhost:3000" : "");
  if (!value) throw new BookingError("Online reservations are not configured yet.",503);
  const url=new URL(value);
  if (process.env.NODE_ENV==="production" && url.protocol!=="https:") throw new BookingError("A secure website address is required.",503);
  return url.origin;
}
export function assertOrigin(request: NextRequest) { if (request.headers.get("origin")!==siteOrigin()) throw new BookingError("Please submit your booking from the Dojworld website.",403); }
export async function readBody(request: NextRequest) {
  const raw=await request.text();
  if (Buffer.byteLength(raw)>8192) throw new BookingError("The submitted details are too long.",413);
  try { const body=JSON.parse(raw); if(!body || typeof body!=="object" || Array.isArray(body)) throw new Error("Invalid body"); return body; } catch { throw new BookingError("The booking details could not be read."); }
}
export async function rateLimit(request: NextRequest, scope: string, max: number, seconds: number, identity?: string) {
  const secret=process.env.BOOKING_RATE_LIMIT_SECRET;
  if (!secret) throw new BookingError("Online reservations are not configured yet.",503);
  // Set this to a header overwritten by the hosting platform/reverse proxy.
  const header=process.env.BOOKING_CLIENT_IP_HEADER || "x-forwarded-for";
  const ip=request.headers.get(header)?.split(",")[0]?.trim() || "local-or-unknown";
  const {data,error}=await bookingClient().rpc("consume_online_limit",{p_key:limitKey(`${scope}:${identity ?? ip}`,secret),p_limit:max,p_seconds:seconds});
  if (error) throw new BookingError("Reservations are temporarily unavailable. Please try again shortly.",503);
  if (data!==true) throw new BookingError("Too many attempts. Please wait a few minutes or contact reception.",429);
}
export function rpcError(error: {code?:string;message:string}): never {
  if (error.code==="23P01") throw new BookingError("That room is no longer available for these dates. Please choose another room.",409);
  if (error.code==="23514" || error.code==="23505" || error.code==="22023") throw new BookingError(error.message,409);
  if (error.code==="P0002") throw new BookingError("Booking not found. Open the confirmation in the browser where you made the booking.",404);
  throw new BookingError("Online reservations are temporarily unavailable. Please contact reception.",503);
}
export function errorResponse(error: unknown) { return NextResponse.json({error:error instanceof BookingError ? error.message : "Something went wrong. Please try again or contact reception."},{status:error instanceof BookingError ? error.status : 500,headers:{"Cache-Control":"no-store"}}); }
export function privateJson(data: unknown) { return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}}); }
export function bookingCookie(id: string) { return `doj_booking_${id}`; }
export function setBookingCookie(response: NextResponse,id: string,token: string) {
  response.cookies.set(bookingCookie(id),token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/api/booking",maxAge:370*86400});
  return response;
}
export function credentials(request: NextRequest,id: unknown) {
  if (typeof id!=="string" || !UUID.test(id)) throw new BookingError("Booking not found.",404);
  const token=request.cookies.get(bookingCookie(id))?.value;
  if (!token || !TOKEN.test(token)) throw new BookingError("Open this confirmation in the browser where you made your booking.",403);
  return {id,token};
}
export async function statusFor(id: string,token: string) {
  const {data,error}=await bookingClient().rpc("online_booking_status",{p_id:id,p_token:token});
  if(error) rpcError(error);
  return data;
}
export async function paystack(path: string, init?: RequestInit) {
  const key=process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new BookingError("Online payment is not available yet. You can request to pay at the hotel.",503);
  const response=await fetch(`https://api.paystack.co/${path}`,{...init,headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},cache:"no-store",signal:AbortSignal.timeout(15000)});
  const body=await response.json();
  if (!response.ok || body.status!==true) throw new BookingError(path==="transaction/initialize" ? "The payment provider could not open checkout. Please retry this booking or contact reception. Do not make a separate bank transfer." : "The payment provider could not complete this check. Try again shortly or contact reception. Do not pay again while an earlier payment is being checked.",503);
  return body.data;
}
export async function initializePayment(id: string,reference: string,email: string,amount: number) {
  const data=await paystack("transaction/initialize",{method:"POST",body:JSON.stringify({email,amount,reference,currency:"NGN",callback_url:`${siteOrigin()}/booking/return?id=${id}`,metadata:{booking_id:id,hotel:"Dojworld"}})});
  if (typeof data.authorization_url!=="string" || !/^https:\/\/checkout\.paystack\.com\//.test(data.authorization_url)) throw new BookingError("The payment provider returned an invalid checkout link.",503);
  const {error}=await bookingClient().rpc("set_online_checkout",{p_id:id,p_url:data.authorization_url});
  if(error) rpcError(error);
  return data.authorization_url as string;
}
export async function verifyPayment(reference: string) {
  if (!/^DOJ-[a-f0-9]{32}$/.test(reference)) throw new BookingError("Invalid payment reference.");
  try {
    const data=await paystack(`transaction/verify/${encodeURIComponent(reference)}`);
    const paid=verifiedTransaction(data,reference);
    if (paid) {
      const {error}=await bookingClient().rpc("confirm_online_payment",{p_reference:reference,p_amount:data.amount,p_currency:data.currency});
      if(error) rpcError(error);
    }
    const {error}=await bookingClient().rpc("record_booking_payment_check",{p_reference:reference,p_outcome:paid?"paid":"unpaid",p_error:null});
    // Keep existing checkout working during the additive database rollout.
    if(error && !["PGRST202","42883"].includes(error.code)) rpcError(error);
    revalidatePath("/manage");
    return paid;
  } catch(error) {
    await bookingClient().rpc("record_booking_payment_check",{p_reference:reference,p_outcome:"error",p_error:"Payment verification could not complete. Retry with Paystack before asking the guest to pay again."});
    throw error;
  }
}
