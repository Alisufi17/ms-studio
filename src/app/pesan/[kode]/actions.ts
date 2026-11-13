"use server";

import { createClient } from "@supabase/supabase-js";
import type { OrderPayload, OrderResult } from "@/components/order-builder";

/** Pesanan dari customer (tanpa login). Harga dihitung ulang di database, bukan dari kiriman browser. */
export async function kirimPesanan(cabang: string, p: OrderPayload): Promise<OrderResult> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("create_public_order", {
    p_cabang: cabang, p_customer: p.customer, p_phone: p.phone, p_metode: p.metode, p_notes: p.notes, p_items: p.items,
  });
  if (error) return { err: error.message || "Pesanan gagal dikirim. Coba lagi." };
  return { ok: "Terkirim", order: data };
}
