import { supabase } from "../lib/supabase";
import {
  createAuthEmailForProject,
  createSignupMetadata,
} from "../utils/accountIdentity";

function createAuthEmail(username) {
  return createAuthEmailForProject(username, import.meta.env.VITE_SUPABASE_URL);
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
      data: createSignupMetadata(username, email),
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
