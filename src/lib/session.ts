import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type Cabang = { nama: string; kode: string; qris_image: string; qris_note: string };
export type Profile = { id: string; username: string; nama: string; role: "pemilik" | "karyawan"; cabang: string | null };

/** Sesi + profil + cabang kerja aktif. Dipanggil sekali per request (di-cache). */
export const getSession = cache(async () => {
  const sb = await createClient();
  // Token sudah divalidasi middleware; query profil di bawah diverifikasi ulang oleh database (RLS).
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) redirect("/login");

  const [{ data: profile }, { data: cabangList }] = await Promise.all([
    sb.from("profiles").select("id,username,nama,role,cabang,aktif").eq("id", uid).maybeSingle(),
    sb.from("cabang").select("nama,kode,qris_image,qris_note").eq("aktif", true).order("urutan"),
  ]);
  if (!profile || !profile.aktif) redirect("/login?err=nonaktif");

  const list = (cabangList ?? []) as Cabang[];
  const picked = (await cookies()).get("ms_cabang")?.value;
  const cabang =
    list.find((c) => c.nama === picked)?.nama ?? list.find((c) => c.nama === profile.cabang)?.nama ?? list[0]?.nama ?? "";

  return { sb, profile: profile as Profile, isOwner: profile.role === "pemilik", cabang, cabangList: list };
});

export async function requireOwner() {
  const s = await getSession();
  if (!s.isOwner) redirect("/kasir");
  return s;
}
