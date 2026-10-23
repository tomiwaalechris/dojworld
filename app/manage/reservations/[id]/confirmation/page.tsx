import { Suspense } from "react";
import type { Metadata } from "next";
import { ReservationDocument } from "@/components/reservation-document";

export const metadata: Metadata = { title: "Booking confirmation | Dojworld", robots: { index: false, follow: false } };

export default function ConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<main className="setup-page"><p role="status">Loading booking confirmation…</p></main>}><Confirmation params={params}/></Suspense>;
}

async function Confirmation({ params }: { params: Promise<{ id: string }> }) {
  return <ReservationDocument id={(await params).id} kind="confirmation"/>;
}
