import Link from "next/link";
import { requireOwner } from "@/lib/session";
import { addDays, isDate, monthStart, rp, rpShort, tgl, today } from "@/lib/format";

type Row = { label: string; nilai: number; jumlah: number };
type Sum = {
  omzet: number; jumlah_trx: number; cash: number; non_cash: number; pengeluaran: number; setoran: number;
  per_metode: Row[]; per_layanan: Row[]; per_cabang: Row[]; per_karyawan: Row[]; per_hari: { tanggal: string; masuk: number; keluar: number }[];
};

function Daftar({ judul, rows, total }: { judul: string; rows: Row[]; total: number }) {
  return (
    <section className="card">
      <h2 className="mb-2 text-[15px] font-extrabold">{judul}</h2>
      {!rows.length && <p className="sub py-3">Belum ada data.</p>}
      {rows.map((r) => (
        <div key={r.label} className="mb-2.5">
          <div className="mb-1 flex justify-between text-[13px]"><span className="font-semibold">{r.label} <span className="font-normal text-muted">· {r.jumlah}×</span></span><b className="num">{rp(r.nilai)}</b></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-rose" style={{ width: `${total ? Math.max(2, (r.nilai / total) * 100) : 0}%` }} /></div>
        </div>
      ))}
    </section>
  );
}

export default async function RingkasanPage({ searchParams }: { searchParams: Promise<{ dari?: string; sampai?: string; cabang?: string }> }) {
  const sp = await searchParams;
  const { sb, cabangList } = await requireOwner();
  const t = today();
  const dari = isDate(sp.dari) ? sp.dari : monthStart(t);
  const sampai = isDate(sp.sampai) && sp.sampai >= dari ? sp.sampai : t;
  const cabang = cabangList.find((c) => c.nama === sp.cabang)?.nama ?? null;

  const [{ data: sum, error }, { data: kas }, { data: hariIni }, { count: pesanan }, { count: bookingPending }, { count: bookingBesok }] = await Promise.all([
    sb.rpc("ringkasan", { p_from: dari, p_to: sampai, p_cabang: cabang }),
    sb.rpc("posisi_kas"),
    sb.rpc("ringkasan", { p_from: t, p_to: t, p_cabang: cabang }),
    sb.from("orders").select("id", { count: "exact", head: true }).in("status", ["Menunggu", "Menunggu Verifikasi"]),
    sb.from("booking").select("id", { count: "exact", head: true }).eq("status", "Pending"),
    sb.from("booking").select("id", { count: "exact", head: true }).eq("tanggal_event", addDays(t, 1)).in("status", ["Aktif", "Lunas"]),
  ]);
  if (error || !sum) return <p className="card text-bad">Ringkasan gagal dimuat: {error?.message}</p>;
  const s = sum as Sum, h = hariIni as Sum | null;
  const maks = Math.max(1, ...s.per_hari.map((d) => d.masuk));
  const url = (o: Record<string, string>) => "/?" + new URLSearchParams({ dari, sampai, ...(cabang ? { cabang } : {}), ...o }).toString();
  const preset = [
    { l: "Hari ini", d: t, s: t }, { l: "7 hari", d: addDays(t, -6), s: t }, { l: "Bulan ini", d: monthStart(t), s: t },
    { l: "Bulan lalu", d: monthStart(addDays(monthStart(t), -1)), s: addDays(monthStart(t), -1) },
  ];

  return (
    <>
      <div className="mb-3">
        <h1 className="h1">Ringkasan</h1>
        <p className="sub">{tgl(dari, { day: "numeric", month: "short", year: "numeric" })} – {tgl(sampai, { day: "numeric", month: "short", year: "numeric" })} · {cabang ?? "Semua cabang"}</p>
      </div>

      <div className="no-print mb-4 flex flex-wrap items-center gap-1.5">
        {preset.map((p) => <Link key={p.l} href={url({ dari: p.d, sampai: p.s })} className={dari === p.d && sampai === p.s ? "chip-on" : "chip"}>{p.l}</Link>)}
        <span className="mx-1 h-5 w-px bg-line" />
        <Link href={"/?" + new URLSearchParams({ dari, sampai }).toString()} className={cabang ? "chip" : "chip-on"}>Semua cabang</Link>
        {cabangList.map((c) => <Link key={c.nama} href={url({ cabang: c.nama })} className={cabang === c.nama ? "chip-on" : "chip"}>{c.nama}</Link>)}
        <form key={dari + sampai} action="/" className="ml-auto flex items-center gap-1.5">
          {cabang && <input type="hidden" name="cabang" value={cabang} />}
          <input type="date" name="dari" defaultValue={dari} max={t} className="input w-36 py-1.5" aria-label="Dari" />
          <input type="date" name="sampai" defaultValue={sampai} max={t} className="input w-36 py-1.5" aria-label="Sampai" />
          <button className="btn-ghost btn-sm">Terapkan</button>
        </form>
        <a className="btn-ghost btn-sm" href={`/export/laporan?dari=${dari}&sampai=${sampai}&cabang=${cabang ?? ""}`}>⬇ Laporan keuangan (Excel)</a>
      </div>

      {((pesanan ?? 0) > 0 || (bookingPending ?? 0) > 0) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(pesanan ?? 0) > 0 && <Link href="/kasir" className="pill-warn px-3 py-1.5 text-xs">{pesanan} pesanan QR menunggu pembayaran →</Link>}
          {(bookingPending ?? 0) > 0 && <Link href="/booking?cabang=semua" className="pill-warn px-3 py-1.5 text-xs">{bookingPending} booking menunggu konfirmasi DP →</Link>}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="card bg-rose text-white"><p className="text-xs font-semibold opacity-85">Omzet periode</p><b className="num text-2xl">{rp(s.omzet)}</b><p className="text-xs opacity-85">{s.jumlah_trx} transaksi</p></div>
        <div className="card"><p className="label">Hari ini</p><b className="num text-2xl">{rp(h?.omzet ?? 0)}</b><p className="sub text-xs">{h?.jumlah_trx ?? 0} transaksi · {bookingBesok ?? 0} booking besok</p></div>
        <div className="card"><p className="label">Pengeluaran periode</p><b className="num text-2xl text-bad">{rp(s.pengeluaran)}</b><p className="sub text-xs">operasional tercatat</p></div>
        <div className="card"><p className="label">Masuk − keluar</p><b className={`num text-2xl ${s.omzet - s.pengeluaran >= 0 ? "text-ok" : "text-bad"}`}>{rp(s.omzet - s.pengeluaran)}</b><p className="sub text-xs">belum termasuk gaji/sewa yang tidak dicatat</p></div>
      </div>

      <section className="card mb-4">
        <h2 className="mb-3 text-[15px] font-extrabold">Omzet per hari <span className="sub font-semibold">· klik batang untuk membuka buku kas hari itu</span></h2>
        <div className="flex h-40 items-end gap-[3px] overflow-x-auto">
          {s.per_hari.map((d) => (
            <Link key={d.tanggal} href={`/kas?dari=${d.tanggal}&sampai=${d.tanggal}&cabang=${cabang ?? "semua"}`} title={`${tgl(d.tanggal)} · ${rp(d.masuk)}`}
              className="group flex h-full min-w-[14px] flex-1 flex-col items-center justify-end">
              <span className="num mb-0.5 hidden text-[9px] font-bold group-hover:block sm:block">{d.masuk && s.per_hari.length <= 31 ? rpShort(d.masuk) : ""}</span>
              <span className="w-full rounded-t bg-rose/80 group-hover:bg-rose" style={{ height: `${Math.max(d.masuk ? 3 : 1, (d.masuk / maks) * 78)}%` }} />
              <span className="mt-1 text-[9px] text-muted">{Number(d.tanggal.slice(8))}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Daftar judul="Per layanan" rows={s.per_layanan} total={s.omzet} />
        <Daftar judul="Per cabang" rows={s.per_cabang} total={s.omzet} />
        <Daftar judul="Per metode bayar" rows={s.per_metode} total={s.omzet} />
        <Daftar judul="Per karyawan (yang mencatat)" rows={s.per_karyawan} total={s.omzet} />
        <section className="card md:col-span-2">
          <h2 className="mb-1 text-[15px] font-extrabold">Kas di laci saat ini</h2>
          <p className="sub mb-2 text-xs">Seluruh cash masuk − pengeluaran cash − setoran, sejak awal pencatatan.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {((kas ?? []) as { cabang: string; kas: number }[]).map((k) => (
              <div key={k.cabang} className="flex items-center justify-between rounded-xl bg-soft px-4 py-3"><b>{k.cabang}</b><b className={`num text-lg ${k.kas < 0 ? "text-bad" : ""}`}>{rp(k.kas)}</b></div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
