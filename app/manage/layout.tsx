import type { Metadata } from "next";
export const metadata: Metadata = { title: "Hotel Management | DOJ World Suites", robots: { index: false, follow: false } };
export default function ManageLayout({ children }: { children: React.ReactNode }) { return children; }
