"use client";

import { useState } from "react";
import { ActionForm, MoneyInput } from "@/components/ui";
import { buatJob } from "@/app/(app)/actions";
import { JENIS_JOB } from "@/lib/constants";

export type JobRingkas = { tanggal: string; jam: string | null; klien: string; jenis: string | null; lokasi: string | null; cabang: string | null };

/** Form job luar. Begitu tanggal dipilih, job lain di tanggal itu langsung ditampilkan sebagai peringatan. */
export function JobForm({ cabang, minDate, jobs }: { cabang: string; minDate: string; jobs: JobRingkas[] }) {
  const [tanggal, setTanggal] = useState("");
  const sama = tanggal ? jobs.filter((j) => j.tanggal === tanggal) : [];
  return (
    <ActionForm action={buatJob} submit="Simpan job" className="mt-3 grid gap-2 sm:grid-cols-2" submitClass="btn-primary sm:col-span-2" onDone={() => setTanggal("")}>
      <div><label className="label">Nama klien / acara *</label><input name="klien" className="input" required /></div>
      <div><label className="label">No. WhatsApp klien</label><input name="no_hp" inputMode="tel" className="input" placeholder="08xx" /></div>
      <div><label className="label">Tanggal acara *</label><input type="date" name="tanggal" min={minDate} value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="input" required /></div>
      <div><label className="label">Jam mulai</label><input type="time" name="jam" className="input" /></div>
      {sama.length > 0 && (
        <div className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2.5 text-[13px] sm:col-span-2" role="alert">
          <p className="font-medium text-warn">Sudah ada {sama.length} job lain di tanggal ini</p>
          <ul className="mt-1 space-y-0.5 text-xs text-warn">
            {sama.map((j, i) => (
              <li key={i}>{j.klien} — {[j.jenis, j.jam, j.lokasi, j.cabang].filter(Boolean).join(", ")}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">Tetap bisa disimpan. Pastikan alat dan tim cukup untuk semuanya.</p>
        </div>
      )}
      <div><label className="label">Jenis</label><select name="jenis" className="input">{JENIS_JOB.map((j) => <option key={j}>{j}</option>)}</select></div>
      <div><label className="label">Paket</label><input name="paket" className="input" placeholder="mis. Gold 3 jam" /></div>
      <div><label className="label">Lokasi</label><input name="lokasi" className="input" placeholder="Gedung / alamat" /></div>
      <div><label className="label">Tim yang berangkat</label><input name="tim" className="input" placeholder="mis. Hansen, Duwi" /></div>
      <div><label className="label">Total harga *</label><MoneyInput name="total" required /></div>
      <div><label className="label">Catatan</label><input name="catatan" className="input" placeholder="backdrop, tema, kebutuhan khusus" /></div>
      <p className="sub text-xs sm:col-span-2">Dicatat atas cabang {cabang}. DP dan pelunasan dicatat setelah job tersimpan, supaya langsung masuk Buku Kas.</p>
    </ActionForm>
  );
}
