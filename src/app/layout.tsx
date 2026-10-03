import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./fonts.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Autoclip — link to viral shorts",
  description:
    "Paste a video link or upload a file. Autoclip finds the best moments, adds animated captions and effects, and exports ready-to-post vertical clips.",
  keywords: ["Autoclip", "video clips", "shorts", "captions", "AI"],
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Autoclip", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-100`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
