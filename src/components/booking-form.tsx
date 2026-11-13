"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LAYANAN, METODE, ruangDari, SLOTS } from "@/lib/constants";
import { ActionForm, MoneyInput } from "@/components/ui";
import { buatBooking } from "@/app/(app)/actions";

/** Form booking manual. Jam yang sudah terisi (ruang & cabang yang sama) otomatis tidak bisa dipilih. */
export function BookingForm({ cabang, minDate }: { cabang: string; minDate: string }) {
  const [layanan, setLayanan] = useState<string>(LAYANAN[0]);
  const [tanggal, setTanggal] = useState("");
  const [taken, setTaken] = useState<string[]>([]);

  useEffect(() => {
    if (!tanggal) return;
    let alive = true;
    createClient().rpc("booked_slots", { p_cabang: cabang, p_tanggal: tanggal, p_ruang: ruangDari(layanan) })
      .then(({ data }) => alive && setTaken((data as string[] | null) ?? []));
    return () => { alive = false; };
  }, [cabang, tanggal, layanan]);

  return (
    <ActionForm action={buatBooking} submit="Simpan booking" className="grid gap-2 sm:grid-cols-2" submitClass="btn-primary sm:col-span-2" onDone={() => setTanggal("")}>
      <div><label className="label">Nama customer *</label><input name="customer" className="input" required /></div>
      <div><label className="label">No. WhatsApp</label><input name="no_hp" inputMode="tel" className="input" placeholder="08xx" /></div>
      <div><label className="label">Layanan</label>
        <select name="layanan" className="input" value={layanan} onChange={(e) => setLayanan(e.target.value)}>{LAYANAN.map((l) => <option key={l}>{l}</option>)}</select></div>
      <div><label className="label">Paket / keterangan</label><input name="paket" className="input" placeholder="mis. Gold" /></div>
      <div><label className="label">Tanggal *</label><input type="date" name="tanggal_event" min={minDate} value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="input" required /></div>
      <div><label className="label">Jam * <span className="font-normal">({ruangDari(layanan)})</span></label>
        <select name="jam_event" className="input" required defaultValue="">
          <option value="" disabled>{tanggal ? "Pilih jam" : "Pilih tanggal dulu"}</option>
          {tanggal && SLOTS.map((s) => <option key={s} value={s} disabled={taken.includes(s)}>{s}{taken.includes(s) ? " (terisi)" : ""}</option>)}
        </select></div>
      <div><label className="label">Total harga *</label><MoneyInput name="total" required /></div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div><label className="label">DP diterima sekarang</label><MoneyInput name="dp" /></div>
        <div><label className="label">Metode</label><select name="metode_dp" className="input">{METODE.map((m) => <option key={m}>{m}</option>)}</select></div>
      </div>
      <div className="sm:col-span-2"><label className="label">Catatan</label><input name="catatan" className="input" placeholder="background, jumlah orang, dll." /></div>
    </ActionForm>
  );
}
