import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = { title: "MS Studio", description: "Kasir, booking & buku kas MS Studio" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#e11d6b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={`${inter.variable} font-sans`}>{children}</body>
    </html>
  );
}
