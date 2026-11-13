"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Menyegarkan data halaman saat ada perubahan pesanan (realtime), dengan cadangan tiap 30 detik. */
export function LiveRefresh({ table = "orders" }: { table?: string }) {
  const router = useRouter();
  useEffect(() => {
    const sb = createClient();
    const ch = sb.channel("live-" + table).on("postgres_changes", { event: "*", schema: "public", table }, () => router.refresh()).subscribe();
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), 30000);
    return () => { sb.removeChannel(ch); clearInterval(t); };
  }, [router, table]);
  return null;
}
