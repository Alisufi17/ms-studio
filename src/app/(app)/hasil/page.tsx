import { getSession } from "@/lib/session";
import { addDays, tgl, today } from "@/lib/format";
import { LAYANAN } from "@/lib/constants";
import { labelH, selisihHari } from "@/lib/pengingat";
import { ActionButton, ActionForm } from "@/components/ui";
import { batalKirimHasil, buatHasil, kirimHasil, ubahHasil } from "../actions";

type H = {
  id: string; customer: string; no_hp: string | null; layanan: string | null; cabang: string | null; tanggal_foto: string; tenggat: string; pic: string | null;
  status: string; terkirim_at: string | null; terkirim_oleh: string | null; catatan: string | null;
};
const wa = (hp: string | null) => (hp ? "https://wa.me/" + hp.replace(/\D/g, "").replace(/^0/, "62") : null);

export default async function HasilPage() {
  const { sb, isOwner, profile } = await getSession();
  const t = today();
  const [{ data: p }, { data: s }, { data: staf }] = await Promise.all([
    sb.from("hasil_edit").select("*").eq("status", "Proses").order("tenggat").limit(300),
    sb.from("hasil_edit").select("*").eq("status", "Terkirim").gte("terkirim_at", addDays(t, -30) + "T00:00:00+07:00").order("terkirim_at", { ascending: false }).limit(300),
    sb.from("profiles").select("nama").eq("aktif", true).order("nama"),
  ]);
  const proses = (p ?? []) as H[], selesai = (s ?? []) as H[], nama = ((staf ?? []) as { nama: string }[]).map((x) => x.nama);
  const telatKirim = (x: H) => !!x.terkirim_at && new Date(x.terkirim_at).getTime() > Date.parse(x.tenggat + "T23:59:59+07:00");
  const rekap = nama.map((n) => {
    const kirim = selesai.filter((x) => (x.pic ?? x.terkirim_oleh) === n);
    return { n, antre: proses.filter((x) => x.pic === n).length, telatSekarang: proses.filter((x) => x.pic === n && x.tenggat < t).length, kirim: kirim.length, telat: kirim.filter(telatKirim).length };
  });
  const Pic = ({ value }: { value?: string | null }) => (
    <select name="pic" defaultValue={value ?? profile.nama} className="input">{[...new Set([...(value ? [value] : []), ...nama])].map((n) => <option key={n}>{n}</option>)}</select>
  );

  return (
    <>
      <div className="mb-4"><h1 className="h1">Hasil Edit</h1>
        <p className="sub">Semua hasil foto yang belum dikirim ke customer. Masuk otomatis saat booking/job ditandai selesai atau paket foto dibayar di kasir.</p></div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className={`card ${proses.some((x) => x.tenggat < t) ? "border-bad/40 bg-bad-soft" : ""}`}><p className="label">Telat</p><b className="num text-2xl font-semibold text-bad">{proses.filter((x) => x.tenggat < t).length}</b></div>
        <div className="card"><p className="label">Jatuh tempo hari ini / besok</p><b className="num text-2xl font-semibold text-warn">{proses.filter((x) => x.tenggat >= t && x.tenggat <= addDays(t, 1)).length}</b></div>
        <div className="card"><p className="label">Masih dalam antrean</p><b className="num text-2xl font-semibold">{proses.length}</b></div>
        <div className="card"><p className="label">Terkirim 30 hari</p><b className="num text-2xl font-semibold text-ok">{selesai.length}</b><p className="sub text-xs">{selesai.filter(telatKirim).length} di antaranya telat</p></div>
      </div>

      <details className="card no-print mb-4">
        <summary className="h2">+ Tambah manual</summary>
        <ActionForm action={buatHasil} submit="Masukkan ke antrean" className="mt-3 grid gap-2 sm:grid-cols-3" submitClass="btn-primary sm:col-span-3">
          <div><label className="label">Nama customer *</label><input name="customer" className="input" required /></div>
          <div><label className="label">No. WhatsApp</label><input name="no_hp" inputMode="tel" className="input" /></div>
          <div><label className="label">Layanan</label><select name="layanan" className="input" defaultValue="Foto Keluarga">{[...LAYANAN, "Job Luar"].map((l) => <option key={l}>{l}</option>)}</select></div>
          <div><label className="label">Tanggal foto</label><input type="date" name="tanggal_foto" defaultValue={t} max={t} className="input" /></div>
          <div><label className="label">Batas kirim *</label><input type="date" name="tenggat" defaultValue={addDays(t, 3)} className="input" required /></div>
          <div><label className="label">Penanggung jawab</label><Pic /></div>
          <div className="sm:col-span-3"><label className="label">Catatan</label><input name="catatan" className="input" placeholder="jumlah foto, permintaan khusus" /></div>
        </ActionForm>
      </details>

      <section className="card mb-4">
        <h2 className="mb-1 h2">Belum dikirim <span className="sub font-medium">· urut dari yang paling mendesak</span></h2>
        <div className="divide-y divide-line">
          {proses.map((x) => {
            const h = selisihHari(x.tenggat), link = wa(x.no_hp);
            return (
              <div key={x.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
                  <span className={`${h < 0 ? "pill-bad" : h <= 1 ? "pill-warn" : "pill-mute"} w-[5.5rem] justify-center`}>{h < 0 ? `telat ${-h} hari` : labelH(h)}</span>
                  <span className="min-w-0 flex-1">
                    <b>{x.customer}</b> <span className="text-muted">· {x.layanan}{x.cabang ? ` · ${x.cabang}` : ""}</span>
                    <span className="block text-[11px] text-muted">foto {tgl(x.tanggal_foto)} · batas {tgl(x.tenggat)} · PJ <b className={x.pic === profile.nama ? "text-rose" : ""}>{x.pic ?? "belum ada"}</b>{x.catatan ? ` · ${x.catatan}` : ""}</span>
                  </span>
                  {link && <a href={link} target="_blank" rel="noreferrer" className="btn-ghost btn-sm no-print">WhatsApp</a>}
                  <ActionButton action={kirimHasil.bind(null, x.id)} className="btn-ok btn-sm no-print" confirm={`Hasil ${x.customer} sudah benar-benar dikirim ke customer?`}>Sudah dikirim</ActionButton>
                </div>
                <details className="no-print mt-1">
                  <summary className="text-[11px] font-medium text-muted underline">ubah penanggung jawab{isOwner ? " / batas kirim" : ""}</summary>
                  <ActionForm action={ubahHasil} submit="Simpan" submitClass="btn-ghost btn-sm self-end" className="mt-1.5 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="rid" value={x.id} />
                    <div className="w-36"><label className="label">PJ</label><Pic value={x.pic} /></div>
                    <div className="w-40"><label className="label">Batas kirim</label><input type="date" name="tenggat" defaultValue={x.tenggat} className="input" readOnly={!isOwner} /></div>
                    <div className="min-w-40 flex-1"><label className="label">Catatan</label><input name="catatan" defaultValue={x.catatan ?? ""} className="input" /></div>
                  </ActionForm>
                </details>
              </div>
            );
          })}
          {!proses.length && <p className="sub py-6 text-center">Semua hasil sudah terkirim.</p>}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <details className="card">
          <summary className="h2">Terkirim 30 hari terakhir <span className="sub font-medium">· {selesai.length}</span></summary>
          <div className="mt-2 divide-y divide-line">
            {selesai.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center gap-x-3 py-2 text-[13px]">
                <span className={telatKirim(x) ? "pill-bad" : "pill-ok"}>{telatKirim(x) ? "telat" : "tepat waktu"}</span>
                <span className="min-w-0 flex-1"><b>{x.customer}</b> <span className="text-muted">· {x.layanan}</span>
                  <span className="block text-[11px] text-muted">batas {tgl(x.tenggat)} · dikirim {tgl(x.terkirim_at!.slice(0, 10))} oleh {x.terkirim_oleh}</span></span>
                {isOwner && <ActionButton action={batalKirimHasil.bind(null, x.id)} className="btn-ghost btn-sm no-print" confirm="Kembalikan ke antrean?">Belum terkirim</ActionButton>}
              </div>
            ))}
          </div>
        </details>
        <section className="card self-start">
          <h2 className="mb-2 h2">Per penanggung jawab</h2>
          {rekap.filter((r) => r.antre || r.kirim).map((r) => (
            <div key={r.n} className="flex items-center justify-between border-b border-line py-2 text-[13px] last:border-0">
              <b>{r.n}</b>
              <span className="text-right text-xs text-muted">{r.antre} antre{r.telatSekarang ? <b className="text-bad"> · {r.telatSekarang} telat</b> : ""}<br />30 hari: {r.kirim} terkirim, <b className={r.telat ? "text-bad" : "text-ok"}>{r.telat} telat</b></span>
            </div>
          ))}
          {!rekap.some((r) => r.antre || r.kirim) && <p className="sub">Belum ada data.</p>}
        </section>
      </div>
    </>
  );
}
