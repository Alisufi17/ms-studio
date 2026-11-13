import ExcelJS from "exceljs";
import { requireOwner } from "@/lib/session";
import { addDays } from "@/lib/format";
import { ambilSemua, bacaParam, kirimXlsx, KOLOM_MASUK, lembar, RP, waktuWib } from "@/lib/export";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v) || 0;
const kelompok = (rows: Row[], key: (r: Row) => string, val: (r: Row) => number) => {
  const m = new Map<string, { nilai: number; jumlah: number }>();
  rows.forEach((r) => { const k = key(r) || "Lainnya", c = m.get(k) ?? { nilai: 0, jumlah: 0 }; c.nilai += val(r); c.jumlah++; m.set(k, c); });
  return [...m.entries()].sort((a, b) => b[1].nilai - a[1].nilai);
};
const layanan = (r: Row) => { const l = String(r.layanan ?? ""); return /^self ?photo$/i.test(l) ? "Self Photo" : /graduation|wisuda/i.test(l) ? "Foto Wisuda" : l === "POS" ? "Kasir (lama)" : l; };

/** Laporan keuangan: ringkasan, rekap harian, dan rincian semua baris. Khusus pemilik. */
export async function GET(req: Request) {
  const { sb, cabangList } = await requireOwner();
  const { dari, sampai, cabang } = bacaParam(new URL(req.url), cabangList);
  const [masuk, keluar, setor] = await Promise.all([
    ambilSemua(sb, "transaksi", "tanggal", dari, sampai, cabang),
    ambilSemua(sb, "pengeluaran", "tanggal", dari, sampai, cabang, (q) => q.is("dibatalkan_at", null)),
    ambilSemua(sb, "setoran", "tanggal_omset", dari, sampai, cabang),
  ]);
  const totalMasuk = masuk.reduce((s, r) => s + n(r.total), 0), totalKeluar = keluar.reduce((s, r) => s + n(r.jumlah), 0), totalSetor = setor.reduce((s, r) => s + n(r.jumlah), 0);
  const cashMasuk = masuk.filter((r) => r.metode === "Cash").reduce((s, r) => s + n(r.total), 0), cashKeluar = keluar.filter((r) => r.metode === "Cash").reduce((s, r) => s + n(r.jumlah), 0);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Laporan");
  ws.columns = [{ width: 34 }, { width: 12 }, { width: 20, style: { numFmt: RP } }];
  const judul = (t: string) => { const r = ws.addRow([t]); r.font = { bold: true, size: 12 }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE1EC" } }; };
  const tebal = (a: string, c: number) => { ws.addRow([a, "", c]).font = { bold: true }; };
  ws.addRow(["LAPORAN KEUANGAN MS STUDIO"]).font = { bold: true, size: 14 };
  ws.addRow([`Periode ${dari} s.d. ${sampai} · ${cabang ?? "Semua cabang"}`]);
  ws.addRow([]);
  judul("PEMASUKAN PER LAYANAN");
  kelompok(masuk, layanan, (r) => n(r.total)).forEach(([k, v]) => ws.addRow([k, `${v.jumlah}×`, v.nilai]));
  tebal("Total pemasukan", totalMasuk);
  ws.addRow([]);
  judul("PENGELUARAN PER KATEGORI");
  kelompok(keluar, (r) => String(r.kategori ?? ""), (r) => n(r.jumlah)).forEach(([k, v]) => ws.addRow([k, `${v.jumlah}×`, v.nilai]));
  tebal("Total pengeluaran", totalKeluar);
  ws.addRow([]);
  tebal("SELISIH (pemasukan − pengeluaran)", totalMasuk - totalKeluar);
  ws.addRow(["Hanya dari yang tercatat di Buku Kas; gaji/sewa yang tidak dicatat belum terhitung."]).font = { italic: true, size: 9 };
  ws.addRow([]);
  judul("PEMASUKAN PER METODE");
  kelompok(masuk, (r) => String(r.metode ?? ""), (r) => n(r.total)).forEach(([k, v]) => ws.addRow([k, `${v.jumlah}×`, v.nilai]));
  ws.addRow([]);
  judul("PEMASUKAN PER CABANG");
  kelompok(masuk, (r) => String(r.cabang ?? ""), (r) => n(r.total)).forEach(([k, v]) => ws.addRow([k, `${v.jumlah}×`, v.nilai]));
  ws.addRow([]);
  judul("KAS LACI PERIODE INI");
  ws.addRow(["Cash masuk", "", cashMasuk]);
  ws.addRow(["Pengeluaran cash", "", cashKeluar]);
  ws.addRow(["Cash yang harus disetor", "", cashMasuk - cashKeluar]);
  ws.addRow(["Sudah disetor", "", totalSetor]);
  tebal("Selisih setoran (＋ = belum disetor)", cashMasuk - cashKeluar - totalSetor);

  const harian: Row[] = [];
  for (let d = dari; d <= sampai; d = addDays(d, 1)) {
    const m = masuk.filter((r) => r.tanggal === d), sum = (met: string) => m.filter((r) => r.metode === met).reduce((s, r) => s + n(r.total), 0);
    const tm = m.reduce((s, r) => s + n(r.total), 0), tk = keluar.filter((r) => r.tanggal === d).reduce((s, r) => s + n(r.jumlah), 0);
    harian.push({ tanggal: d, trx: m.length, cash: sum("Cash"), qris: sum("QRIS"), transfer: sum("Transfer"), masuk: tm, keluar: tk, selisih: tm - tk, setoran: setor.filter((r) => r.tanggal_omset === d).reduce((s, r) => s + n(r.jumlah), 0) });
  }
  lembar(wb, "Harian", [
    { header: "Tanggal", key: "tanggal", width: 12 }, { header: "Jml transaksi", key: "trx", width: 13 }, { header: "Cash", key: "cash", uang: true }, { header: "QRIS", key: "qris", uang: true },
    { header: "Transfer", key: "transfer", uang: true }, { header: "Total masuk", key: "masuk", uang: true }, { header: "Pengeluaran", key: "keluar", uang: true },
    { header: "Selisih", key: "selisih", uang: true }, { header: "Setoran", key: "setoran", uang: true },
  ], harian);
  lembar(wb, "Uang Masuk", KOLOM_MASUK, masuk.map((r) => ({ ...r, waktu: waktuWib(r.created_at) })));
  lembar(wb, "Pengeluaran", [
    { header: "Tanggal", key: "tanggal", width: 12 }, { header: "Cabang", key: "cabang", width: 13 }, { header: "Keterangan", key: "keterangan", width: 34 }, { header: "Kategori", key: "kategori" },
    { header: "Metode", key: "metode", width: 10 }, { header: "Jumlah", key: "jumlah", uang: true }, { header: "Dicatat oleh", key: "nama" },
  ], keluar);
  lembar(wb, "Setoran", [
    { header: "Omzet tanggal", key: "tanggal_omset", width: 14 }, { header: "Tanggal setor", key: "tanggal", width: 14 }, { header: "Cabang", key: "cabang", width: 13 },
    { header: "Penyetor", key: "nama" }, { header: "Jumlah", key: "jumlah", uang: true }, { header: "Catatan", key: "catatan", width: 30 },
  ], setor);
  return kirimXlsx(wb, `laporan-keuangan_${cabang ?? "semua-cabang"}_${dari}_sd_${sampai}`);
}
