import type { Metadata } from "next";
import { DojworldWebsite } from "@/components/dojworld-website";
export const metadata: Metadata = { title: "Photo Gallery | DOJ World Suites" };
export default function Page() { return <DojworldWebsite page="gallery" />; }
