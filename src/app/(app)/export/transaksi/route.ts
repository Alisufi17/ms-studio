import ExcelJS from "exceljs";
import { requireOwner } from "@/lib/session";
import { ambilSemua, bacaParam, kirimXlsx, KOLOM_MASUK, lembar, waktuWib } from "@/lib/export";

/** Export semua uang masuk pada rentang tanggal & cabang terpilih. Khusus pemilik. */
export async function GET(req: Request) {
  const { sb, cabangList } = await requireOwner();
  const { dari, sampai, cabang } = bacaParam(new URL(req.url), cabangList);
  const rows = await ambilSemua(sb, "transaksi", "tanggal", dari, sampai, cabang);
  const wb = new ExcelJS.Workbook();
  lembar(wb, "Transaksi", KOLOM_MASUK, rows.map((r) => ({ ...r, waktu: waktuWib(r.created_at) })));
  return kirimXlsx(wb, `transaksi_${cabang ?? "semua-cabang"}_${dari}_sd_${sampai}`);
}
