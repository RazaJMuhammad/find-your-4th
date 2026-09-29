import { headers } from "next/headers";

export async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const headerList = await headers();
  const origin = headerList.get("origin") ?? headerList.get("x-forwarded-host");
  if (origin?.startsWith("http")) return origin;
  if (origin) return `https://${origin}`;
  return "http://localhost:3000";
}
