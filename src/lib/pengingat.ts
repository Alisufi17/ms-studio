import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, today } from "./format";

export type Job = { id: string; tanggal: string; jam: string | null; klien: string; jenis: string | null; lokasi: string | null; cabang: string | null };
export type Hasil = { id: string; customer: string; layanan: string | null; cabang: string | null; tenggat: string; pic: string | null };

export const JOB_HARI = 4; // job luar mulai diingatkan H-4

export const selisihHari = (tanggal: string, dari = today()) =>
  Math.round((Date.parse(tanggal + "T00:00:00Z") - Date.parse(dari + "T00:00:00Z")) / 864e5);

export const labelH = (n: number) => (n < 0 ? `lewat ${-n} hari` : n === 0 ? "HARI INI" : n === 1 ? "BESOK" : `H-${n}`);

/** Yang perlu perhatian sekarang: job luar ≤ H-4 dan hasil edit yang telat / jatuh tempo ≤ besok. */
export async function getPengingat(sb: SupabaseClient) {
  const t = today();
  const [{ data: jobs }, { data: hasil }] = await Promise.all([
    sb.from("event").select("id,tanggal,jam,klien,jenis,lokasi,cabang").eq("status", "Terjadwal").gte("tanggal", t).lte("tanggal", addDays(t, JOB_HARI)).order("tanggal"),
    sb.from("hasil_edit").select("id,customer,layanan,cabang,tenggat,pic").eq("status", "Proses").lte("tenggat", addDays(t, 1)).order("tenggat"),
  ]);
  const h = (hasil ?? []) as Hasil[];
  return { jobs: (jobs ?? []) as Job[], telat: h.filter((x) => x.tenggat < t), segera: h.filter((x) => x.tenggat >= t) };
}
