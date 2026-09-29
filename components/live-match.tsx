"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LiveMatch({ matchId }: { matchId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`match:${matchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_slots", filter: `match_id=eq.${matchId}` }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, router]);
  return null;
}

export function CopyLink({ path }: { path: string }) {
  return <CopyText label="Copy link" text={path} />;
}

export function CopyText({ label, text }: { label: string; text: string }) {
  return (
    <button
      className="btn btn-quiet"
      type="button"
      onClick={() => {
        const absolute = text.replace(/(^|[\s])(\/[\w/?=&%-]+)/g, (_match, lead: string, path: string) => `${lead}${window.location.origin}${path}`);
        void navigator.clipboard.writeText(absolute);
      }}
    >
      {label}
    </button>
  );
}
