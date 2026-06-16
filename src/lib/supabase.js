import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublishableKey);

const cookieChunkSize = 3500;
const maxCookieChunks = 20;

function getCookieAttributes() {
  return `Path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
}

function getCookies() {
  return new Map(
    document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separatorIndex = cookie.indexOf("=");
        return [
          decodeURIComponent(cookie.slice(0, separatorIndex)),
          cookie.slice(separatorIndex + 1),
        ];
      })
  );
}

function removeCookie(name) {
  document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; ${getCookieAttributes()}`;
}

const browserSessionCookieStorage = {
  getItem(key) {
    const cookies = getCookies();
    const chunkCount = Number(cookies.get(`${key}.chunks`) || 0);

    if (chunkCount === 0) {
      return null;
    }

    const value = Array.from({ length: chunkCount }, (_, index) =>
      cookies.get(`${key}.${index}`)
    ).join("");

    return value ? decodeURIComponent(value) : null;
  },

  removeItem(key) {
    const cookies = getCookies();
    const chunkCount = Number(cookies.get(`${key}.chunks`) || 0);

    removeCookie(`${key}.chunks`);

    for (let index = 0; index < Math.max(chunkCount, maxCookieChunks); index += 1) {
      removeCookie(`${key}.${index}`);
    }
  },

  setItem(key, value) {
    browserSessionCookieStorage.removeItem(key);

    const encodedValue = encodeURIComponent(value);
    const chunks =
      encodedValue.match(new RegExp(`.{1,${cookieChunkSize}}`, "g")) || [];

    document.cookie = `${encodeURIComponent(`${key}.chunks`)}=${chunks.length}; ${getCookieAttributes()}`;

    chunks.forEach((chunk, index) => {
      document.cookie = `${encodeURIComponent(`${key}.${index}`)}=${chunk}; ${getCookieAttributes()}`;
    });
  },
};

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        storage: browserSessionCookieStorage,
      },
    })
  : null;
