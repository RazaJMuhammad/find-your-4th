"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { disablePush } from "@/lib/push";
import { asRating } from "@/lib/format";
import type { Profile } from "@/lib/types";

type AuthValue = {
  ready: boolean;
  userId: string | null;
  profile: Profile | null;
  refreshProfile: () => Promise<Profile | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const refreshProfile = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("my_profile");
    if (error || !data) {
      setProfile(null);
      return null;
    }
    const next = data as Profile;
    next.playtomic_rating = asRating(next.playtomic_rating);
    setProfile(next);
    return next;
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const id = data.session?.user.id ?? null;
      setUserId(id);
      if (id) await refreshProfile();
      setReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const id = session?.user.id ?? null;
      setUserId(id);
      if (id) await refreshProfile();
      else setProfile(null);
      setReady(true);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    try {
      await disablePush();
    } catch {
      // Signing out still continues when this phone has no subscription.
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    setUserId(null);
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({ ready, userId, profile, refreshProfile, signOut }),
    [ready, userId, profile, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
