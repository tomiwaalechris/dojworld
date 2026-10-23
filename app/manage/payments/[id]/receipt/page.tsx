import { Suspense } from "react";
import type { Metadata } from "next";
import { ReservationDocument } from "@/components/reservation-document";

export const metadata: Metadata = { title: "Payment receipt | Dojworld", robots: { index: false, follow: false } };

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<main className="setup-page"><p role="status">Loading payment receipt…</p></main>}><Receipt params={params}/></Suspense>;
}

async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  return <ReservationDocument id={(await params).id} kind="receipt"/>;
}
