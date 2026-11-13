import Link from "next/link";
import { getSession } from "@/lib/session";
import { addDays, isDate, jam, monthStart, rp, tgl, today } from "@/lib/format";
import { KATEGORI_KELUAR, LAYANAN, METODE } from "@/lib/constants";
import { ActionButton, ActionForm, MoneyInput } from "@/components/ui";
import { hapusBaris, tambahKeluar, tambahMasuk, tambahSetoran } from "../actions";

type SP = { dari?: string; sampai?: string; cabang?: string; metode?: string; q?: string };
type Trx = { id: string; tanggal: string; cabang: string; karyawan: string; customer: string; layanan: string; paket: string | null; total: number; metode: string; payment_stage: string | null; created_at: string };
type Keluar = { id: string; tanggal: string; cabang: string; nama: string; keterangan: string; kategori: string; jumlah: number; metode: string };
type Setor = { id: string; tanggal: string; tanggal_omset: string | null; cabang: string; nama: string; jumlah: number; catatan: string | null };

const MetodeSelect = () => (
  <select name="metode" className="input" defaultValue="Cash">{METODE.map((m) => <option key={m}>{m}</option>)}</select>
);

export default async function BukuKasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { sb, cabang: cabangKerja, cabangList, isOwner } = await getSession();
  const t = today();
  const dari = isDate(sp.dari) ? sp.dari : t;
  const sampai = isDate(sp.sampai) && sp.sampai >= dari ? sp.sampai : dari;
  const cabang = sp.cabang === "semua" ? null : cabangList.find((c) => c.nama === sp.cabang)?.nama ?? cabangKerja;
  const metode = (METODE as readonly string[]).includes(sp.metode ?? "") ? sp.metode! : "";
  const q = (sp.q ?? "").trim().slice(0, 40);
  const satuHari = dari === sampai;

  let trxQ = sb.from("transaksi").select("*").gte("tanggal", dari).lte("tanggal", sampai).order("tanggal", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  let klrQ = sb.from("pengeluaran").select("*").gte("tanggal", dari).lte("tanggal", sampai).is("dibatalkan_at", null).order("tanggal", { ascending: false }).limit(300);
  let strQ = sb.from("setoran").select("*").gte("tanggal_omset", dari).lte("tanggal_omset", sampai).order("tanggal", { ascending: false }).limit(300);
  if (cabang) { trxQ = trxQ.eq("cabang", cabang); klrQ = klrQ.eq("cabang", cabang); strQ = strQ.eq("cabang", cabang); }
  if (metode) trxQ = trxQ.eq("metode", metode);
  if (q) trxQ = trxQ.ilike("customer", `%${q.replace(/[%_,()]/g, " ")}%`);

  const [{ data: trxData }, { data: klrData }, { data: strData }, { data: sum }] = await Promise.all([
    trxQ, klrQ, strQ, sb.rpc("ringkasan", { p_from: dari, p_to: sampai, p_cabang: cabang }),
  ]);
  const trx = (trxData ?? []) as Trx[], keluar = (klrData ?? []) as Keluar[], setor = (strData ?? []) as Setor[];
  const s = sum ?? { omzet: 0, cash: 0, non_cash: 0, pengeluaran: 0, keluar_cash: 0, setoran: 0, jumlah_trx: 0 };
  const harusSetor = s.cash - s.keluar_cash;
  const selisih = harusSetor - s.setoran;

  const url = (o: Partial<SP>) => {
    const p = { dari, sampai, cabang: cabang ?? "semua", metode, q, ...o };
    return "/kas?" + new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();
  };
  const preset = [
    { l: "Hari ini", d: t, s: t }, { l: "Kemarin", d: addDays(t, -1), s: addDays(t, -1) },
    { l: "7 hari", d: addDays(t, -6), s: t }, { l: "Bulan ini", d: monthStart(t), s: t },
  ];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Buku Kas</h1>
          <p className="sub">{satuHari ? tgl(dari, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : `${tgl(dari)} – ${tgl(sampai)}`} · {cabang ?? "Semua cabang"}</p>
        </div>
        <div className="no-print flex flex-wrap gap-1.5">
          {isOwner && <a className="btn-ghost btn-sm" href={`/export/transaksi?dari=${dari}&sampai=${sampai}&cabang=${cabang ?? ""}`}>Export transaksi</a>}
          {isOwner && <a className="btn-ghost btn-sm" href={`/export/laporan?dari=${dari}&sampai=${sampai}&cabang=${cabang ?? ""}`}>Laporan keuangan</a>}
        {satuHari && (
          <>
            <Link className="btn-ghost btn-sm" href={url({ dari: addDays(dari, -1), sampai: addDays(dari, -1) })}>← Sehari sebelum</Link>
            {dari < t && <Link className="btn-ghost btn-sm" href={url({ dari: addDays(dari, 1), sampai: addDays(dari, 1) })}>Sehari sesudah →</Link>}
          </>
        )}
        </div>
      </div>

      {/* Saringan: tanggal + cabang selalu terlihat */}
      <form key={`${dari}${sampai}${cabang}${metode}${q}`} className="card no-print mb-4 grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_1.4fr_auto]" action="/kas">
        <div><label className="label">Dari</label><input type="date" name="dari" defaultValue={dari} max={t} className="input" /></div>
        <div><label className="label">Sampai</label><input type="date" name="sampai" defaultValue={sampai} max={t} className="input" /></div>
        <div><label className="label">Cabang</label>
          <select name="cabang" defaultValue={cabang ?? "semua"} className="input">
            {cabangList.map((c) => <option key={c.nama}>{c.nama}</option>)}
            <option value="semua">Semua cabang</option>
          </select></div>
        <div><label className="label">Metode</label>
          <select name="metode" defaultValue={metode} className="input"><option value="">Semua</option>{METODE.map((m) => <option key={m}>{m}</option>)}</select></div>
        <div><label className="label">Cari nama customer</label><input name="q" defaultValue={q} placeholder="mis. Rani" className="input" /></div>
        <button className="btn-primary self-end">Tampilkan</button>
        <div className="col-span-full flex flex-wrap gap-1.5">
          {preset.map((p) => <Link key={p.l} href={url({ dari: p.d, sampai: p.s })} className={dari === p.d && sampai === p.s ? "chip-on" : "chip"}>{p.l}</Link>)}
        </div>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="card"><p className="label">Uang masuk</p><b className="num text-xl font-semibold">{rp(s.omzet)}</b><p className="sub text-xs">{s.jumlah_trx} transaksi</p></div>
        <div className="card"><p className="label">Cash · Non-cash</p><b className="num text-base">{rp(s.cash)}</b><p className="sub num text-xs">{rp(s.non_cash)} QRIS/transfer</p></div>
        <div className="card"><p className="label">Pengeluaran</p><b className="num text-xl font-semibold text-bad">{rp(s.pengeluaran)}</b><p className="sub num text-xs">{rp(s.keluar_cash)} dari laci</p></div>
        <div className={`card ${selisih === 0 ? "" : "border-warn/50 bg-warn-soft/50"}`}>
          <p className="label">Cash harus disetor</p><b className="num text-xl font-semibold">{rp(harusSetor)}</b>
          <p className="sub num text-xs">Disetor {rp(s.setoran)} · {selisih === 0 ? "pas" : selisih > 0 ? `kurang ${rp(selisih)}` : `lebih ${rp(-selisih)}`}</p>
        </div>
      </div>

      <details className="card no-print mb-4">
        <summary className="h2">+ Catat pemasukan lain, pengeluaran, atau setoran <span className="sub font-medium">· untuk {cabangKerja}</span></summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <ActionForm action={tambahMasuk} submit="Simpan pemasukan" className="space-y-2">
            <b className="text-[13px]">Pemasukan (di luar kasir)</b>
            <input type="date" name="tanggal" defaultValue={satuHari ? dari : t} max={t} className="input" />
            <input name="customer" placeholder="Nama customer" className="input" />
            <select name="layanan" className="input" defaultValue="Lainnya">{LAYANAN.map((l) => <option key={l}>{l}</option>)}</select>
            <input name="paket" placeholder="Keterangan (opsional)" className="input" />
            <MoneyInput name="total" placeholder="Nominal" required />
            <MetodeSelect />
          </ActionForm>
          <ActionForm action={tambahKeluar} submit="Simpan pengeluaran" className="space-y-2">
            <b className="text-[13px]">Pengeluaran</b>
            <input type="date" name="tanggal" defaultValue={satuHari ? dari : t} max={t} className="input" />
            <input name="keterangan" placeholder="Beli apa?" className="input" required />
            <select name="kategori" className="input" defaultValue="Lainnya">{KATEGORI_KELUAR.map((k) => <option key={k}>{k}</option>)}</select>
            <MoneyInput name="jumlah" placeholder="Nominal" required />
            <MetodeSelect />
          </ActionForm>
          <ActionForm action={tambahSetoran} submit="Simpan setoran" className="space-y-2">
            <b className="text-[13px]">Setoran kas ke pemilik</b>
            <div><label className="label">Setoran untuk omzet tanggal</label><input type="date" name="tanggal_omset" defaultValue={satuHari ? dari : t} max={t} className="input" /></div>
            <MoneyInput name="jumlah" placeholder="Nominal disetor" defaultValue={satuHari && cabang === cabangKerja && selisih > 0 ? selisih : undefined} required />
            <input name="catatan" placeholder="Catatan (opsional)" className="input" />
          </ActionForm>
        </div>
      </details>

      <section className="card mb-4">
        <h2 className="mb-1 h2">Uang masuk <span className="sub font-medium">· {trx.length}{trx.length === 500 ? "+ (persempit tanggal)" : ""} baris{metode || q ? ` tersaring · ${rp(trx.reduce((n, x) => n + x.total, 0))}` : ""}</span></h2>
        <div className="divide-y divide-line">
          {trx.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-[13px]">
              <span className="num w-[5.5rem] shrink-0 text-xs text-muted">{satuHari ? jam(x.created_at) : `${tgl(x.tanggal, { day: "numeric", month: "short" })} ${jam(x.created_at)}`}</span>
              <span className="min-w-0 flex-1">
                <b>{x.customer || "Umum"}</b>{" "}
                <span className="text-muted">· {x.layanan}{x.payment_stage && x.payment_stage !== "Pembayaran POS" ? ` (${x.payment_stage})` : ""}{x.paket && x.paket !== x.layanan ? ` · ${x.paket}` : ""}</span>
                <span className="block text-[11px] text-muted">{x.karyawan}{cabang ? "" : ` · ${x.cabang}`}</span>
              </span>
              <span className={x.metode === "Cash" ? "pill-ok" : "pill-warn"}>{x.metode}</span>
              <b className="num w-24 text-right">{rp(x.total)}</b>
              {isOwner && <ActionButton action={hapusBaris.bind(null, "transaksi", x.id)} className="btn-danger btn-sm no-print" confirm="Hapus pemasukan ini?">Hapus</ActionButton>}
            </div>
          ))}
          {!trx.length && <p className="sub py-5 text-center">Tidak ada uang masuk pada saringan ini.</p>}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-1 h2">Pengeluaran <span className="sub font-medium">· {keluar.length}</span></h2>
          <div className="divide-y divide-line">
            {keluar.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center gap-x-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1"><b>{x.keterangan}</b><span className="block text-[11px] text-muted">{satuHari ? "" : tgl(x.tanggal) + " · "}{x.kategori} · {x.nama}{cabang ? "" : ` · ${x.cabang}`} · {x.metode}</span></span>
                <b className="num text-bad">{rp(x.jumlah)}</b>
                {isOwner && <ActionButton action={hapusBaris.bind(null, "pengeluaran", x.id)} className="btn-danger btn-sm no-print" confirm="Hapus pengeluaran ini?">Hapus</ActionButton>}
              </div>
            ))}
            {!keluar.length && <p className="sub py-5 text-center">Tidak ada pengeluaran.</p>}
          </div>
        </section>
        <section className="card">
          <h2 className="mb-1 h2">Setoran <span className="sub font-medium">· {setor.length}</span></h2>
          <div className="divide-y divide-line">
            {setor.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center gap-x-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1"><b>{x.nama}</b><span className="block text-[11px] text-muted">omzet {tgl(x.tanggal_omset ?? x.tanggal)} · disetor {tgl(x.tanggal)}{cabang ? "" : ` · ${x.cabang}`}{x.catatan ? ` · ${x.catatan}` : ""}</span></span>
                <b className="num">{rp(x.jumlah)}</b>
                {isOwner && <ActionButton action={hapusBaris.bind(null, "setoran", x.id)} className="btn-danger btn-sm no-print" confirm="Hapus setoran ini?">Hapus</ActionButton>}
              </div>
            ))}
            {!setor.length && <p className="sub py-5 text-center">Belum ada setoran untuk tanggal ini.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
