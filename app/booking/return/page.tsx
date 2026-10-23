import type { Metadata } from "next";
import { BookingConfirmation } from "@/components/booking-confirmation";
export const metadata:Metadata={title:"Your Reservation | DOJ World Suites",robots:{index:false,follow:false}};
export default function Page(){return <BookingConfirmation/>;}
