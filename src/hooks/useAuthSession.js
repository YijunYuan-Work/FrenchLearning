import { useCallback, useEffect, useRef, useState } from "react";
import { signInWithEmail, signOut, signUpWithEmail } from "../api/auth";
import { hasSupabaseConfig, supabase } from "../lib/supabase";

export function useAuthSession({ isDemo, demoUser }) {
  const initialUser = isDemo ? demoUser : null;
  const live = useRef({ userId: initialUser?.id, generation: 0, active: true });
  const [auth, setAuth] = useState({
    user: initialUser, generation: 0, loading: !isDemo && hasSupabaseConfig, error: "",
  });

  const publishUser = useCallback((user) => {
    if (!live.current.active) return;
    // A -> B -> A must not revive callbacks from the first A workspace.
    if (live.current.userId !== user?.id) live.current.generation += 1;
    live.current.userId = user?.id;
    setAuth({ user, generation: live.current.generation, loading: false, error: "" });
  }, []);

  const isCurrentAccount = useCallback(
    () => live.current.active && live.current.generation === auth.generation,
    [auth.generation]
  );

  useEffect(() => {
    const lifecycle = live.current;
    lifecycle.active = true;
    let receivedAuthEvent = false;
    let mounted = true;
    if (isDemo || !hasSupabaseConfig) return () => { lifecycle.active = false; };

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || receivedAuthEvent) return;
      if (error) setAuth((current) => ({ ...current, loading: false, error: error.message }));
      else publishUser(data.session?.user ?? null);
    }).catch((error) => {
      if (mounted && !receivedAuthEvent) setAuth((current) => ({ ...current, loading: false, error: error.message }));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || (event === "INITIAL_SESSION" && receivedAuthEvent)) return;
      receivedAuthEvent = true;
      publishUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      lifecycle.active = false;
      subscription.unsubscribe();
    };
  }, [isDemo, publishUser]);

  // Refresh cached profile details without letting an old account's response win.
  useEffect(() => {
    if (isDemo || !auth.user?.id) return;
    let mounted = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (mounted && isCurrentAccount() && !error && data.user?.id === auth.user.id) {
        setAuth((current) => ({ ...current, user: data.user }));
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, [auth.user?.id, isCurrentAccount, isDemo]);

  const updateUser = useCallback((user) => {
    if (isCurrentAccount() && user?.id === live.current.userId) {
      setAuth((current) => ({ ...current, user }));
    }
  }, [isCurrentAccount]);

  async function handleAuthSubmit({ email, mode, password, username }) {
    if (!isCurrentAccount()) return;
    setAuth((current) => ({ ...current, loading: true, error: "" }));
    try {
      if (mode === "sign-up") await signUpWithEmail(username, email, password);
      else await signInWithEmail(username, password);
    } catch (error) {
      if (isCurrentAccount()) setAuth((current) => ({ ...current, error: error.message }));
    } finally {
      if (isCurrentAccount()) setAuth((current) => ({ ...current, loading: false }));
    }
  }

  async function handleSignOut() {
    if (!isCurrentAccount()) return;
    if (isDemo) { window.location.href = "/"; return; }
    setAuth((current) => ({ ...current, loading: true, error: "" }));
    try {
      await signOut();
      if (isCurrentAccount()) publishUser(null);
    } catch (error) {
      if (isCurrentAccount()) setAuth((current) => ({ ...current, error: error.message, loading: false }));
    }
  }

  return { ...auth, isCurrentAccount, updateUser, handleAuthSubmit, handleSignOut };
}
