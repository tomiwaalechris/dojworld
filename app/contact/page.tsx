import type { Metadata } from "next";
import { DojworldWebsite } from "@/components/dojworld-website";
export const metadata: Metadata = { title: "Contact Us | DOJ World Suites" };
export default function Page() { return <DojworldWebsite page="contact" />; }
