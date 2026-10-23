import type { Metadata } from "next";
import { BookingRecovery } from "@/components/booking-recovery";
export const metadata: Metadata = { title: "Find your booking | Dojworld", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Page() { return <BookingRecovery/>; }
