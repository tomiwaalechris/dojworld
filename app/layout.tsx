import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const dashboardFont = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-dashboard",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dojworld.vercel.app"),
  applicationName: "DOJ World Suites",
  openGraph: { siteName: "DOJ World Suites", locale: "en_NG", type: "website" },
  twitter: { card: "summary_large_image" },
  title: "DOJ World Suites | A Stay That’s All About You",
  description: "Discover DOJ World Suites in Ikeja, Lagos. Explore our rooms, restaurant and bar, and plan your next stay at 13B Bamishile Street, off Allen Avenue.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={dashboardFont.variable}><body>{children}</body></html>;
}
