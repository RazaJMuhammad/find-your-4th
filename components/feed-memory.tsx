"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function FeedMemory() {
  const router = useRouter();
  const search = useSearchParams();
  useEffect(() => {
    if (search.get("fresh") === "1") {
      sessionStorage.removeItem("feed-filters");
      router.replace("/");
      return;
    }
    const current = search.toString();
    if (current) {
      sessionStorage.setItem("feed-filters", current);
      return;
    }
    const saved = sessionStorage.getItem("feed-filters");
    if (saved) router.replace(`/?${saved}`);
  }, [router, search]);
  return null;
}

export function clearFeedMemory() {
  sessionStorage.removeItem("feed-filters");
}
