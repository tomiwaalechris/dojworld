import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, privateJson } from "@/lib/booking/server";
import { runBookingTasks } from "@/lib/booking/tasks";
export const maxDuration = 120;
export async function POST(request: NextRequest) {
  const secret = process.env.BOOKING_WORKER_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || secret.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return new NextResponse("Unauthorized", { status: 401 });
  try { return privateJson(await runBookingTasks()); } catch (error) { return errorResponse(error); }
}
