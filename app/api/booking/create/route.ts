import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { assertOrigin, BookingError, bookingClient, errorResponse, initializePayment, privateJson, rateLimit, readBody, rpcError, setBookingCookie } from "@/lib/booking/server";
import { checkoutError, type CheckoutInput } from "@/lib/booking/validation";
export async function POST(request: NextRequest) {
  let body: CheckoutInput | undefined;
  try {
    assertOrigin(request);
    await rateLimit(request,"checkout",10,900);
    body=await readBody(request) as CheckoutInput;
    const invalid=checkoutError(body);if(invalid) throw new BookingError(invalid);
    if(body.plan!=="arrival"&&!process.env.PAYSTACK_SECRET_KEY) throw new BookingError("Online payments are not enabled yet. Please request to pay at the hotel.",503);
    await rateLimit(request,"guest-checkout",6,3600,`${body.email.trim().toLowerCase()}:${body.phone.trim()}`);
    const {data,error}=await bookingClient().rpc("begin_online_booking",{p_id:body.id,p_token:body.token,p_slug:body.slug,p_arrival:body.arrival,p_departure:body.departure,p_adults:body.guests,p_name:body.name,p_email:body.email,p_phone:body.phone,p_plan:body.plan,p_expected_total:body.expectedTotal,p_expected_policy:body.expectedPolicy});
    if(error) rpcError(error);
    if(!["payment_pending","requested","confirmed"].includes(data.state)) throw new BookingError("This booking attempt is no longer active. Refresh the room and start again.",409);
    let checkoutUrl=data.state==="payment_pending"?data.checkoutUrl:null;
    if(data.state==="payment_pending" && new Date(data.expiresAt).getTime()<=Date.now()) throw new BookingError("This checkout hold expired. Refresh the room and start a new booking.",409);
    if(data.state==="payment_pending"&&!checkoutUrl) checkoutUrl=await initializePayment(data.id,data.reference,data.email,Number(data.amountKobo));
    revalidatePath("/manage");
    return setBookingCookie(privateJson({id:data.id,state:data.state,checkoutUrl}),body.id,body.token);
  } catch(error) { return errorResponse(error); }
}
