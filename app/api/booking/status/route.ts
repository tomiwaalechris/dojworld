import { NextRequest } from "next/server";
import { credentials, errorResponse, privateJson, rateLimit, statusFor } from "@/lib/booking/server";
export async function GET(request: NextRequest) {
  try { const {id,token}=credentials(request,request.nextUrl.searchParams.get("id"));await rateLimit(request,"status",60,60);return privateJson(await statusFor(id,token)); } catch(error) {return errorResponse(error);}
}
