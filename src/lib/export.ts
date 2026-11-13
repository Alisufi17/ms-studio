import "server-only";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDate, monthStart, today } from "./format";

type Row = Record<string, unknown>;

/** Ambil SEMUA baris (Supabase membatasi 1.000 baris per permintaan, jadi diambil per halaman). */
export async function ambilSemua(sb: SupabaseClient, tabel: string, kolomTanggal: string, dari: string, sampai: string, cabang: string | null, extra?: (q: any) => any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(tabel).select("*").gte(kolomTanggal, dari).lte(kolomTanggal, sampai).order(kolomTanggal).order("created_at").range(from, from + 999);
    if (cabang) q = q.eq("cabang", cabang);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

export function bacaParam(url: URL, cabangList: { nama: string }[]) {
  const t = today();
  const dari = isDate(url.searchParams.get("dari")) ? url.searchParams.get("dari")! : monthStart(t);
  const s = url.searchParams.get("sampai");
  const sampai = isDate(s) && s >= dari ? s : t;
  const cabang = cabangList.find((c) => c.nama === url.searchParams.get("cabang"))?.nama ?? null;
  return { dari, sampai, cabang };
}

export const RP = '"Rp" #,##0;[Red]-"Rp" #,##0';

export function lembar(wb: ExcelJS.Workbook, nama: string, kolom: { header: string; key: string; width?: number; uang?: boolean }[], rows: Row[]) {
  const ws = wb.addWorksheet(nama, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = kolom.map((k) => ({ header: k.header, key: k.key, width: k.width ?? 16, style: k.uang ? { numFmt: RP } : {} }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE1EC" } };
  rows.forEach((r) => ws.addRow(r));
  const uang = kolom.filter((k) => k.uang);
  if (rows.length && uang.length) {
    const total = ws.addRow({ [kolom[0].key]: "TOTAL", ...Object.fromEntries(uang.map((k) => [k.key, rows.reduce((n, r) => n + (Number(r[k.key]) || 0), 0)])) });
    total.font = { bold: true };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: kolom.length } };
  return ws;
}

export async function kirimXlsx(wb: ExcelJS.Workbook, nama: string) {
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nama}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}

export const KOLOM_MASUK = [
  { header: "Tanggal", key: "tanggal", width: 12 }, { header: "Cabang", key: "cabang", width: 13 }, { header: "Customer", key: "customer", width: 24 },
  { header: "Layanan", key: "layanan", width: 16 }, { header: "Keterangan", key: "paket", width: 32 }, { header: "Tahap", key: "payment_stage", width: 18 },
  { header: "Metode", key: "metode", width: 10 }, { header: "Jumlah", key: "total", width: 15, uang: true }, { header: "Dicatat oleh", key: "karyawan", width: 14 },
  { header: "Waktu catat (WIB)", key: "waktu", width: 19 },
];
export const waktuWib = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).slice(0, 16) : "");
