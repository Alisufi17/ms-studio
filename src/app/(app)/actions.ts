"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailDari, METODE, ruangDari, type Res } from "@/lib/constants";
import { isDate, num, str, today } from "@/lib/format";
import type { OrderPayload, OrderResult } from "@/components/order-builder";

const pesan = (e: { message?: string; code?: string } | null, fallback = "Gagal menyimpan") =>
  e?.code === "42501" ? "Kamu tidak berhak melakukan ini." : e?.message || fallback;
const metodeOk = (m: string) => (METODE as readonly string[]).includes(m);
const segarkan = () => revalidatePath("/", "layout");

/* ---------------- Sesi ---------------- */
export async function setCabang(nama: string) {
  const { cabangList } = await getSession();
  if (cabangList.some((c) => c.nama === nama))
    (await cookies()).set("ms_cabang", nama, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  segarkan();
}

export async function logout() {
  const { sb } = await getSession();
  await sb.auth.signOut();
  redirect("/login");
}

/* ---------------- Kasir ---------------- */
export async function checkout(p: OrderPayload): Promise<OrderResult> {
  const { sb, cabang } = await getSession();
  const { data, error } = await sb.rpc("pos_checkout", {
    p_cabang: cabang, p_customer: p.customer, p_phone: p.phone, p_metode: p.metode, p_notes: p.notes, p_items: p.items,
  });
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: `Tersimpan · ${data.order_no}`, order: data };
}

export async function konfirmasiPesanan(id: string, metode: string): Promise<Res> {
  const { sb } = await getSession();
  const { error } = await sb.rpc("confirm_order", { p_order_id: id, p_metode: metodeOk(metode) ? metode : null });
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: "Pembayaran dicatat" };
}

export async function batalkanPesanan(id: string): Promise<Res> {
  const { sb } = await getSession();
  const { error } = await sb.rpc("cancel_order", { p_order_id: id });
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: "Pesanan dibatalkan" };
}

/* ---------------- Buku kas ---------------- */
export async function tambahMasuk(_: Res, fd: FormData): Promise<Res> {
  const { sb, profile, cabang } = await getSession();
  const row = {
    tanggal: isDate(fd.get("tanggal")) ? String(fd.get("tanggal")) : today(), cabang, karyawan: profile.nama,
    customer: str(fd.get("customer")) || "Umum", layanan: str(fd.get("layanan")) || "Lainnya", paket: str(fd.get("paket")) || null,
    total: num(fd.get("total")), metode: str(fd.get("metode")),
  };
  if (row.total <= 0 || !metodeOk(row.metode)) return { err: "Isi nominal dan metode pembayaran." };
  const { error } = await sb.from("transaksi").insert(row);
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: "Pemasukan tercatat" };
}

export async function tambahKeluar(_: Res, fd: FormData): Promise<Res> {
  const { sb, profile, cabang, isOwner } = await getSession();
  const row = {
    tanggal: isDate(fd.get("tanggal")) ? String(fd.get("tanggal")) : today(), cabang, nama: profile.nama, oleh: isOwner ? "Pemilik" : "Karyawan",
    keterangan: str(fd.get("keterangan")), kategori: str(fd.get("kategori")) || "Lainnya", jumlah: num(fd.get("jumlah")),
    metode: str(fd.get("metode")), jenis: "operasional",
  };
  if (!row.keterangan || row.jumlah <= 0 || !metodeOk(row.metode)) return { err: "Isi keterangan, nominal, dan metode." };
  const { error } = await sb.from("pengeluaran").insert(row);
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: "Pengeluaran tercatat" };
}

export async function tambahSetoran(_: Res, fd: FormData): Promise<Res> {
  const { sb, profile, cabang } = await getSession();
  const omset = isDate(fd.get("tanggal_omset")) ? String(fd.get("tanggal_omset")) : today();
  const row = { tanggal: today(), tanggal_setor: today(), tanggal_omset: omset, cabang, nama: profile.nama, jumlah: num(fd.get("jumlah")), catatan: str(fd.get("catatan")) };
  if (row.jumlah <= 0) return { err: "Isi nominal setoran." };
  const { error } = await sb.from("setoran").insert(row);
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: "Setoran tercatat" };
}

/** Hapus baris buku kas — database hanya mengizinkan pemilik. */
export async function hapusBaris(tabel: "transaksi" | "pengeluaran" | "setoran", id: string): Promise<Res> {
  const { sb, isOwner } = await getSession();
  if (!isOwner) return { err: "Hanya pemilik yang bisa menghapus." };
  if (!["transaksi", "pengeluaran", "setoran"].includes(tabel)) return { err: "Tabel tidak dikenal" };
  if (tabel === "transaksi") {
    const { data } = await sb.from("transaksi").select("order_id,booking_id").eq("id", id).maybeSingle();
    if (data?.order_id) return { err: "Ini pembayaran pesanan kasir. Batalkan pesanannya dari menu Kasir › Riwayat." };
    if (data?.booking_id) return { err: "Ini pembayaran booking. Ubah dari menu Booking." };
  }
  const { error } = await sb.from(tabel).delete().eq("id", id);
  if (error) return { err: pesan(error, "Gagal menghapus") };
  segarkan();
  return { ok: "Dihapus" };
}

/* ---------------- Booking ---------------- */
export async function buatBooking(_: Res, fd: FormData): Promise<Res> {
  const { sb, cabang } = await getSession();
  const layanan = str(fd.get("layanan")), dp = num(fd.get("dp")), metodeDp = str(fd.get("metode_dp")) || "Cash";
  const row = {
    customer: str(fd.get("customer")), no_hp: str(fd.get("no_hp")), layanan, ruang: ruangDari(layanan), paket: str(fd.get("paket")) || null,
    cabang, tanggal_event: str(fd.get("tanggal_event")), jam_event: str(fd.get("jam_event")), total: num(fd.get("total")),
    dp: 0, catatan: str(fd.get("catatan")), status: "Aktif", source: "manual", updated_at: new Date().toISOString(),
  };
  if (!row.customer || !isDate(row.tanggal_event) || !/^\d{2}:\d{2}$/.test(row.jam_event) || row.total <= 0)
    return { err: "Isi nama, tanggal, jam, dan total." };
  if (dp > row.total) return { err: "DP tidak boleh melebihi total." };
  const { data, error } = await sb.from("booking").insert(row).select("id").single();
  if (error) return { err: error.code === "23505" ? "Jam itu sudah terisi booking lain." : pesan(error) };
  if (dp > 0) {
    const { error: e2 } = await sb.rpc("booking_pay", { p_booking_id: data.id, p_stage: "DP", p_jumlah: dp, p_metode: metodeOk(metodeDp) ? metodeDp : "Cash", p_cabang: cabang });
    if (e2) { segarkan(); return { err: "Booking tersimpan, tetapi DP gagal dicatat: " + pesan(e2) }; }
  }
  segarkan();
  return { ok: "Booking tersimpan" };
}

export async function bayarBooking(_: Res, fd: FormData): Promise<Res> {
  const { sb, cabang } = await getSession();
  const stage = str(fd.get("stage")), metode = str(fd.get("metode"));
  if (!metodeOk(metode)) return { err: "Pilih metode pembayaran." };
  const { error } = await sb.rpc("booking_pay", {
    p_booking_id: str(fd.get("rid")), p_stage: stage === "DP" ? "DP" : "Pelunasan", p_jumlah: num(fd.get("jumlah")), p_metode: metode, p_cabang: cabang,
  });
  if (error) return { err: error.code === "23505" ? "Jam itu sudah terisi booking lain." : pesan(error) };
  segarkan();
  return { ok: "Pembayaran dicatat" };
}

export async function statusBooking(id: string, status: "Selesai" | "Batal"): Promise<Res> {
  const { sb } = await getSession();
  if (status !== "Selesai" && status !== "Batal") return { err: "Status tidak valid" };
  const { error } = await sb.from("booking").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: "Diperbarui" };
}

/* ---------------- Job luar ---------------- */
export async function buatJob(_: Res, fd: FormData): Promise<Res> {
  const { sb, cabang } = await getSession();
  const row = {
    tanggal: str(fd.get("tanggal")), jam: str(fd.get("jam")) || null, klien: str(fd.get("klien")), no_hp: str(fd.get("no_hp")) || null,
    jenis: str(fd.get("jenis")) || "Lainnya", paket: str(fd.get("paket")) || null, lokasi: str(fd.get("lokasi")), tim: str(fd.get("tim")),
    total: num(fd.get("total")), dp: 0, hpp: 0, catatan: str(fd.get("catatan")) || null, cabang, status: "Terjadwal",
  };
  if (!row.klien || !isDate(row.tanggal) || row.total <= 0) return { err: "Isi nama klien, tanggal acara, dan total harga." };
  const { error } = await sb.from("event").insert(row);
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: "Job luar tersimpan" };
}

export async function bayarJob(_: Res, fd: FormData): Promise<Res> {
  const { sb, cabang } = await getSession();
  const metode = str(fd.get("metode"));
  if (!metodeOk(metode)) return { err: "Pilih metode pembayaran." };
  const { error } = await sb.rpc("event_pay", {
    p_event_id: str(fd.get("rid")), p_stage: str(fd.get("stage")) === "DP" ? "DP" : "Pelunasan", p_jumlah: num(fd.get("jumlah")), p_metode: metode, p_cabang: cabang,
  });
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: "Pembayaran dicatat" };
}

export async function statusJob(id: string, status: "Selesai" | "Batal"): Promise<Res> {
  const { sb } = await getSession();
  if (status !== "Selesai" && status !== "Batal") return { err: "Status tidak valid" };
  const { error } = await sb.from("event").update({ status }).eq("id", id);
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: "Diperbarui" };
}

/* ---------------- Hasil edit ---------------- */
export async function buatHasil(_: Res, fd: FormData): Promise<Res> {
  const { sb, cabang, profile } = await getSession();
  const row = {
    customer: str(fd.get("customer")), no_hp: str(fd.get("no_hp")) || null, layanan: str(fd.get("layanan")) || "Lainnya", cabang,
    tanggal_foto: isDate(fd.get("tanggal_foto")) ? String(fd.get("tanggal_foto")) : today(), tenggat: str(fd.get("tenggat")),
    pic: str(fd.get("pic")) || profile.nama, catatan: str(fd.get("catatan")) || null,
  };
  if (!row.customer || !isDate(row.tenggat)) return { err: "Isi nama customer dan batas kirim." };
  const { error } = await sb.from("hasil_edit").insert(row);
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: "Masuk antrean" };
}

export async function kirimHasil(id: string): Promise<Res> {
  const { sb, profile } = await getSession();
  const { error } = await sb.from("hasil_edit").update({ status: "Terkirim", terkirim_at: new Date().toISOString(), terkirim_oleh: profile.nama }).eq("id", id);
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: "Ditandai terkirim" };
}

export async function ubahHasil(_: Res, fd: FormData): Promise<Res> {
  const { sb, isOwner } = await getSession();
  const tenggat = str(fd.get("tenggat"));
  if (!isDate(tenggat)) return { err: "Batas kirim tidak valid." };
  // admin boleh ganti penanggung jawab & catatan; memundurkan batas kirim hanya pemilik
  const patch: Record<string, string | null> = { pic: str(fd.get("pic")) || null, catatan: str(fd.get("catatan")) || null };
  if (isOwner) patch.tenggat = tenggat;
  const { error } = await sb.from("hasil_edit").update(patch).eq("id", str(fd.get("rid")));
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: "Diperbarui" };
}

export async function batalKirimHasil(id: string): Promise<Res> {
  const { sb, isOwner } = await getSession();
  if (!isOwner) return { err: "Hanya pemilik." };
  const { error } = await sb.from("hasil_edit").update({ status: "Proses", terkirim_at: null, terkirim_oleh: null }).eq("id", id);
  if (error) return { err: pesan(error) };
  segarkan();
  return {};
}

/* ---------------- Katalog (pemilik) ---------------- */
export async function simpanKatalog(_: Res, fd: FormData): Promise<Res> {
  const { sb, isOwner, cabangList } = await getSession();
  if (!isOwner) return { err: "Hanya pemilik." };
  const id = str(fd.get("rid")), addon = str(fd.get("item_type")) === "addon";
  const row = {
    cabang: str(fd.get("cabang")), category: str(fd.get("category")), name: str(fd.get("name")), description: str(fd.get("description")),
    price: num(fd.get("price")), original_price: num(fd.get("original_price")) || null, item_type: addon ? "addon" : "package",
    included_people: addon ? 0 : num(fd.get("included_people")), extra_person_price: addon ? 0 : num(fd.get("extra_person_price")),
    max_people: addon ? 0 : num(fd.get("max_people")) || 30, applies_to: str(fd.get("applies_to")), sort_order: num(fd.get("sort_order")) || 1,
    active: fd.get("active") === "on", updated_at: new Date().toISOString(),
  };
  if (!row.category || !row.name || row.price <= 0 || !cabangList.some((c) => c.nama === row.cabang)) return { err: "Kategori, nama, dan harga wajib diisi." };
  const rows = id ? [] : fd.get("semua_cabang") === "on" ? cabangList.map((c) => ({ ...row, cabang: c.nama })) : [row];
  const { error } = id ? await sb.from("catalog_items").update(row).eq("id", id) : await sb.from("catalog_items").insert(rows);
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: "Katalog tersimpan" };
}

export async function toggleKatalog(id: string, active: boolean): Promise<Res> {
  const { sb, isOwner } = await getSession();
  if (!isOwner) return { err: "Hanya pemilik." };
  const { error } = await sb.from("catalog_items").update({ active, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { err: pesan(error) };
  segarkan();
  return {};
}

export async function simpanQris(_: Res, fd: FormData): Promise<Res> {
  const { sb, isOwner } = await getSession();
  if (!isOwner) return { err: "Hanya pemilik." };
  const image = str(fd.get("qris_image"));
  if (image && !/^https:\/\//.test(image)) return { err: "Alamat gambar harus diawali https://" };
  const { error } = await sb.from("cabang").update({ qris_image: image, qris_note: str(fd.get("qris_note")) }).eq("nama", str(fd.get("nama")));
  if (error) return { err: pesan(error) };
  segarkan();
  return { ok: "QRIS tersimpan" };
}

/* ---------------- Akun (pemilik, lewat kunci server) ---------------- */
export async function buatAkun(_: Res, fd: FormData): Promise<Res> {
  const { isOwner } = await getSession();
  if (!isOwner) return { err: "Hanya pemilik." };
  const nama = str(fd.get("nama")), username = str(fd.get("username")).toLowerCase(), password = String(fd.get("password") ?? "");
  const role = str(fd.get("role")) === "pemilik" ? "pemilik" : "karyawan", cabang = str(fd.get("cabang")) || null;
  if (!nama || !/^[a-z0-9._-]{3,30}$/.test(username)) return { err: "Username 3–30 karakter: huruf kecil, angka, titik, strip." };
  if (password.length < 8) return { err: "Kata sandi minimal 8 karakter." };
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email: emailDari(username), password, email_confirm: true });
  if (error || !data.user) return { err: /already/i.test(error?.message ?? "") ? "Username sudah dipakai." : pesan(error, "Gagal membuat akun") };
  const { error: e2 } = await admin.from("profiles").insert({ id: data.user.id, username, nama, role, cabang });
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { err: pesan(e2) };
  }
  segarkan();
  return { ok: `Akun ${username} dibuat` };
}

export async function ubahAkun(_: Res, fd: FormData): Promise<Res> {
  const { isOwner, profile } = await getSession();
  if (!isOwner) return { err: "Hanya pemilik." };
  const id = str(fd.get("rid")), password = String(fd.get("password") ?? "");
  const role = str(fd.get("role")) === "pemilik" ? "pemilik" : "karyawan", aktif = fd.get("aktif") === "on";
  if (id === profile.id && (role !== "pemilik" || !aktif)) return { err: "Tidak bisa menurunkan atau menonaktifkan akunmu sendiri." };
  if (password && password.length < 8) return { err: "Kata sandi minimal 8 karakter." };
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ nama: str(fd.get("nama")), role, cabang: str(fd.get("cabang")) || null, aktif }).eq("id", id);
  if (error) return { err: pesan(error) };
  if (password || !aktif) {
    // ganti sandi; akun nonaktif juga diblokir di sisi Auth supaya sesi lamanya tidak bisa diperpanjang
    const { error: e2 } = await admin.auth.admin.updateUserById(id, { ...(password ? { password } : {}), ban_duration: aktif ? "none" : "876000h" });
    if (e2) return { err: pesan(e2) };
  } else {
    await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
  }
  segarkan();
  return { ok: "Akun diperbarui" };
}
