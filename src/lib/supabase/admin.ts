import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Klien dengan kunci rahasia. Hanya untuk kelola akun, dan hanya dipanggil dari server. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diisi di server");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
