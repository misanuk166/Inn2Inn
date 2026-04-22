import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const URL = () => required("NEXT_PUBLIC_SUPABASE_URL");
const ANON = () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY");

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// Browser-side Supabase client (used in Client Components).
export function browserSupabase() {
  return createBrowserClient(URL(), ANON());
}

// Server-side Supabase client bound to the request's cookies — use in
// Server Components, Route Handlers, and Server Actions.
export async function serverSupabase() {
  const cookieStore = await cookies();
  return createServerClient(URL(), ANON(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies; the middleware handles refresh.
        }
      },
    },
  });
}

// Service-role client — bypasses RLS. Use only in server-side trusted code
// (the data pipeline). NEVER expose this key to the browser.
export function serviceSupabase() {
  return createServiceClient(URL(), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
