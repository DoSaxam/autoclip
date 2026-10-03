import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./fonts.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  variable: "--font-inter-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Autoclip — viral clips from any video",
  description:
    "Paste a video link or upload a file. Autoclip finds the best moments, adds animated captions and effects, and exports ready-to-post vertical clips.",
  keywords: ["Autoclip", "video clips", "shorts", "captions", "AI"],
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Autoclip", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0B0B14",
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
        className={`${inter.variable} antialiased bg-[#0B0B14] text-zinc-100 selection:bg-violet-500/30 selection:text-violet-50`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
