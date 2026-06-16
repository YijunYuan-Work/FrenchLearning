import { supabase } from "../lib/supabase";

function createAuthEmail(username) {
  const projectHost = new URL(import.meta.env.VITE_SUPABASE_URL).hostname;
  const normalizedUsername = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${normalizedUsername}@${projectHost}`;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user;
}

export async function signInWithEmail(username, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: createAuthEmail(username),
    password,
  });

  if (error) {
    throw error;
  }

  return data.user;
}

export async function signUpWithEmail(username, email, password) {
  const { data, error } = await supabase.auth.signUp({
    email: createAuthEmail(username),
    password,
    options: {
      data: {
        name: username,
        profileEmail: email.trim(),
        username,
      },
    },
  });

  if (error) {
    throw error;
  }

  return data.user;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}
