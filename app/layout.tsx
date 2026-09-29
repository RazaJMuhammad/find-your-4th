import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { JetBrains_Mono } from "next/font/google";
import { brand } from "@/config/copy";
import { Shell } from "@/components/shell";
import { SerwistProvider } from "./serwist";
import "./globals.css";

const cabinet = localFont({
  src: [
    { path: "../fonts/CabinetGrotesk-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/CabinetGrotesk-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-cabinet",
  display: "swap",
  fallback: ["Georgia"],
  adjustFontFallback: "Times New Roman",
});

const general = localFont({
  src: [
    { path: "../fonts/GeneralSans-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/GeneralSans-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/GeneralSans-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/GeneralSans-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-general",
  display: "swap",
  adjustFontFallback: "Arial",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

const themeScript = `(function(){try{if(localStorage.getItem("theme")==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}})()`;

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0E7C86",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${cabinet.variable} ${general.variable} ${jetbrains.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-dvh bg-surface text-ink">
        <Script id="theme" strategy="beforeInteractive">{themeScript}</Script>
        <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV === "development"}>
          <Shell>{children}</Shell>
        </SerwistProvider>
      </body>
    </html>
  );
}
