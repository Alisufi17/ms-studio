import { getSession } from "@/lib/session";
import { rp, tgl, today } from "@/lib/format";
import { METODE } from "@/lib/constants";
import { JOB_HARI, labelH, selisihHari } from "@/lib/pengingat";
import { ActionButton, ActionForm, MoneyInput } from "@/components/ui";
import { bayarJob, buatJob, statusJob } from "../actions";

type E = {
  id: string; tanggal: string; jam: string | null; klien: string; no_hp: string | null; jenis: string | null; paket: string | null; lokasi: string | null; tim: string | null;
  total: number; dp: number; catatan: string | null; cabang: string | null; status: string; dp_paid_at: string | null; pelunasan_paid_at: string | null;
};
const JENIS = ["Photobooth", "Videobooth", "Wedding", "Dokumentasi", "Wisuda Sekolah", "Lainnya"];
const wa = (hp: string | null) => (hp ? "https://wa.me/" + hp.replace(/\D/g, "").replace(/^0/, "62") : null);

function Bayar({ e, stage, jumlah }: { e: E; stage: "DP" | "Pelunasan"; jumlah: number }) {
  return (
    <details className="basis-full sm:basis-auto">
      <summary className={`${stage === "DP" ? "btn-ok" : "btn-primary"} btn-sm`}>{stage === "DP" ? "Catat DP masuk" : `Catat pelunasan ${rp(jumlah)}`}</summary>
      <ActionForm action={bayarJob} submit="Catat pembayaran" submitClass="btn-ok btn-sm" className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-soft p-2.5">
        <input type="hidden" name="rid" value={e.id} /><input type="hidden" name="stage" value={stage} />
        <div className="w-36"><MoneyInput name="jumlah" defaultValue={jumlah || undefined} placeholder="Nominal" /></div>
        <select name="metode" className="input w-28" defaultValue="Transfer">{METODE.map((m) => <option key={m}>{m}</option>)}</select>
      </ActionForm>
    </details>
  );
}

function Kartu({ e }: { e: E }) {
  const h = selisihHari(e.tanggal), aktif = e.status === "Terjadwal";
  const dibayar = (e.dp_paid_at ? e.dp || 0 : 0) + (e.pelunasan_paid_at ? Math.max(0, e.total - (e.dp_paid_at ? e.dp || 0 : 0)) : 0);
  const sisa = Math.max(0, (e.total || 0) - dibayar);
  const dekat = aktif && h >= 0 && h <= JOB_HARI;
  const link = wa(e.no_hp);
  return (
    <article className={`rounded-xl border bg-surface p-3.5 ${dekat ? "border-warn/60 ring-2 ring-warn-soft" : "border-line"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className={aktif ? (h < 0 ? "pill-bad" : dekat ? "pill-warn" : "pill-mute") : e.status === "Batal" ? "pill-bad" : "pill-ok"}>{aktif ? labelH(h) : e.status}</span>
          <b className="ml-2 text-[15px]">{e.klien}</b>
          <span className="mt-0.5 block text-xs text-muted">{tgl(e.tanggal, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{e.jam ? ` · ${e.jam}` : ""} · {e.jenis}{e.paket ? ` ${e.paket}` : ""}</span>
          {(e.lokasi || e.tim) && <span className="block text-xs text-muted">{e.lokasi ? `📍 ${e.lokasi}` : ""}{e.lokasi && e.tim ? " · " : ""}{e.tim ? `👥 ${e.tim}` : ""}</span>}
          {e.catatan && <span className="block text-xs text-muted">📝 {e.catatan}</span>}
        </div>
        <div className="shrink-0 text-right">
          <b className="num block">{rp(e.total)}</b>
          {e.status !== "Batal" && <span className={`num block text-[11px] font-semibold ${sisa ? "text-warn" : "text-ok"}`}>{sisa ? `sisa ${rp(sisa)}` : "lunas ✓"}</span>}
        </div>
      </div>
      {aktif && h < 0 && <p className="mt-2 text-xs font-semibold text-bad">Acara sudah lewat — tandai selesai supaya hasilnya masuk antrean edit.</p>}
      {e.status !== "Batal" && (
        <div className="no-print mt-2.5 flex flex-wrap items-start gap-1.5">
          {!e.dp_paid_at && !e.pelunasan_paid_at && <Bayar e={e} stage="DP" jumlah={e.dp || 0} />}
          {!e.pelunasan_paid_at && (e.dp_paid_at || !e.dp) && sisa > 0 && <Bayar e={e} stage="Pelunasan" jumlah={sisa} />}
          {aktif && <ActionButton action={statusJob.bind(null, e.id, "Selesai")} className="btn-ok btn-sm" confirm="Acara sudah selesai? Hasilnya akan masuk antrean edit (batas kirim 7 hari).">Acara selesai</ActionButton>}
          {link && <a href={link} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">WhatsApp</a>}
          {aktif && <ActionButton action={statusJob.bind(null, e.id, "Batal")} className="btn-danger btn-sm" confirm={`Batalkan job ${e.klien}?`}>Batal</ActionButton>}
        </div>
      )}
    </article>
  );
}

export default async function JobPage() {
  const { sb, cabang } = await getSession();
  const t = today();
  const [{ data: a }, { data: b }] = await Promise.all([
    sb.from("event").select("*").eq("status", "Terjadwal").order("tanggal").limit(200),
    sb.from("event").select("*").neq("status", "Terjadwal").order("tanggal", { ascending: false }).limit(30),
  ]);
  const aktif = (a ?? []) as E[], riwayat = (b ?? []) as E[];
  return (
    <>
      <div className="mb-4"><h1 className="h1">Job Luar</h1><p className="sub">Acara di luar studio. Mulai H-{JOB_HARI} muncul pengingat di semua halaman supaya alat, tim, dan transport siap.</p></div>
      <details className="card no-print mb-4">
        <summary className="text-[15px] font-extrabold">＋ Job luar baru</summary>
        <ActionForm action={buatJob} submit="Simpan job" className="mt-3 grid gap-2 sm:grid-cols-2" submitClass="btn-primary sm:col-span-2">
          <div><label className="label">Nama klien / acara *</label><input name="klien" className="input" required /></div>
          <div><label className="label">No. WhatsApp klien</label><input name="no_hp" inputMode="tel" className="input" placeholder="08xx" /></div>
          <div><label className="label">Tanggal acara *</label><input type="date" name="tanggal" min={t} className="input" required /></div>
          <div><label className="label">Jam mulai</label><input type="time" name="jam" className="input" /></div>
          <div><label className="label">Jenis</label><select name="jenis" className="input">{JENIS.map((j) => <option key={j}>{j}</option>)}</select></div>
          <div><label className="label">Paket</label><input name="paket" className="input" placeholder="mis. Gold 3 jam" /></div>
          <div><label className="label">Lokasi</label><input name="lokasi" className="input" placeholder="Gedung / alamat" /></div>
          <div><label className="label">Tim yang berangkat</label><input name="tim" className="input" placeholder="mis. Hansen, Duwi" /></div>
          <div><label className="label">Total harga *</label><MoneyInput name="total" required /></div>
          <div><label className="label">Catatan</label><input name="catatan" className="input" placeholder="backdrop, tema, kebutuhan khusus" /></div>
          <p className="sub text-xs sm:col-span-2">Dicatat atas cabang {cabang}. DP dan pelunasan dicatat setelah job tersimpan, supaya langsung masuk Buku Kas.</p>
        </ActionForm>
      </details>
      <div className="grid gap-2.5 md:grid-cols-2">{aktif.map((e) => <Kartu key={e.id} e={e} />)}</div>
      {!aktif.length && <p className="sub card py-8 text-center">Belum ada job luar terjadwal.</p>}
      {riwayat.length > 0 && (
        <details className="mt-5">
          <summary className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-muted">Riwayat · {riwayat.length} terakhir</summary>
          <div className="grid gap-2.5 md:grid-cols-2">{riwayat.map((e) => <Kartu key={e.id} e={e} />)}</div>
        </details>
      )}
    </>
  );
}
