import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Klien Supabase atas nama pengguna yang sedang login (hak akses mengikuti RLS). */
export async function createClient() {
  const store = await cookies();
  return createServerClient(SB_URL, SB_ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // dipanggil dari Server Component: cookie disegarkan oleh middleware
        }
      },
    },
  });
}
