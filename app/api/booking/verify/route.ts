import { NextRequest } from "next/server";
import { assertOrigin, credentials, errorResponse, privateJson, rateLimit, readBody, statusFor, verifyPayment } from "@/lib/booking/server";
export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);const body=await readBody(request);const {id,token}=credentials(request,body.id);
    await rateLimit(request,"verify",10,60,id);
    const status=await statusFor(id,token);
    if(status.paymentPlan!=="arrival" && status.paidKobo===0) await verifyPayment(status.reference);
    return privateJson(await statusFor(id,token));
  } catch(error) {return errorResponse(error);}
}
