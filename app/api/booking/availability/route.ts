import { NextRequest } from "next/server";
import { bookingClient, errorResponse, privateJson, rateLimit, rpcError } from "@/lib/booking/server";
import { stayError } from "@/lib/booking/validation";
export async function GET(request: NextRequest) {
  try {
    await rateLimit(request,"availability",120,60);
    const q=request.nextUrl.searchParams;
    const arrival=q.get("arrival"),departure=q.get("departure"),guests=Number(q.get("guests"));
    const invalid=stayError(arrival,departure,guests);
    if(invalid) return privateJson({error:invalid,enabled:false,rooms:[]});
    const {data,error}=await bookingClient().rpc("online_availability",{p_arrival:arrival,p_departure:departure,p_adults:guests});
    if(error) rpcError(error);
    return privateJson({...data,paymentsReady:Boolean(process.env.PAYSTACK_SECRET_KEY)});
  } catch(error) { return errorResponse(error); }
}
