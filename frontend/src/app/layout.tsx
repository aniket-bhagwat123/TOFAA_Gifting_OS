import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "TOFAA Gifting OS",
  description: "Enterprise gifting operations workspace",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "TOFAA", statusBarStyle: "default" }
};

export const viewport: Viewport = { themeColor: "#0B6B57" };

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={inter.variable}><body><Providers>{children}</Providers><PwaRegister /></body></html>;
}
