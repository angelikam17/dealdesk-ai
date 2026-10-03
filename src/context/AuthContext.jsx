import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // undefined = still checking, null = signed out
  const [session, setSession] = useState(isSupabaseConfigured ? undefined : null);
  const [profile, setProfile] = useState(null);
  const [loadedFor, setLoadedFor] = useState(null); // user id the profile was fetched for
  const [profileError, setProfileError] = useState(null);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    // Keep this callback synchronous: awaiting Supabase calls inside it can deadlock.
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    setProfileError(null);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, organization:organizations(id, name, invite_code)')
      .eq('id', userId)
      .maybeSingle();
    if (error) setProfileError(error.message);
    setProfile(data ?? null);
    setLoadedFor(userId);
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({
      configured: isSupabaseConfigured,
      session,
      user: session?.user ?? null,
      profile,
      profileLoading: Boolean(userId) && loadedFor !== userId,
      profileError,
      recovering,
      setRecovering,
      reloadProfile: loadProfile,
      signOut,
    }),
    [session, profile, loadedFor, profileError, userId, recovering, loadProfile, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
