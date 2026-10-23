import { NextRequest, NextResponse } from "next/server";
import { validPaystackSignature } from "@/lib/booking/security";
import { errorResponse, verifyPayment } from "@/lib/booking/server";
import { refreshBookingRefunds, refreshProviderRefund } from "@/lib/booking/reconciliation";
export async function POST(request: NextRequest) {
  const raw=await request.text();
  if (Buffer.byteLength(raw)>131072 || !validPaystackSignature(raw,request.headers.get("x-paystack-signature"),process.env.PAYSTACK_SECRET_KEY ?? "")) return new NextResponse("Invalid signature",{status:401});
  try {
    const event=JSON.parse(raw);
    if(event.event==="charge.success" && typeof event.data?.reference==="string" && /^DOJ-[a-f0-9]{32}$/.test(event.data.reference)) await verifyPayment(event.data.reference);
    if (["refund.pending", "refund.processing", "refund.processed", "refund.failed", "refund.needs-attention"].includes(event.event)) {
      // Documented refund events identify the original transaction, not a refund ID.
      if (typeof event.data?.transaction_reference === "string" && /^DOJ-[a-f0-9]{32}$/.test(event.data.transaction_reference)) await refreshBookingRefunds(event.data.transaction_reference);
      else if (/^[0-9]{1,25}$/.test(String(event.data?.id))) await refreshProviderRefund(String(event.data.id));
    }
    return NextResponse.json({received:true});
  } catch(error) {return errorResponse(error);}
}
