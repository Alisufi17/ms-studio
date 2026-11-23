import { rp, tgl } from "./format";

export type NotaStatus = "tagihan" | "tanda_jadi" | "lunas" | "batal";

/** Sama persis dengan perhitungan di fungsi get_nota (SQL): status ditentukan oleh uang yang tercatat masuk. */
export function statusNota(total: number, dibayar: number, batal: boolean): NotaStatus {
  if (batal) return "batal";
  if (total > 0 && dibayar >= total) return "lunas";
  return dibayar > 0 ? "tanda_jadi" : "tagihan";
}

export const JUDUL: Record<NotaStatus, string> = { tagihan: "Tagihan", tanda_jadi: "Tanda Jadi", lunas: "Bukti Lunas", batal: "Dibatalkan" };
export const TOMBOL: Record<NotaStatus, string> = { tagihan: "Kirim tagihan", tanda_jadi: "Kirim tanda jadi", lunas: "Kirim bukti lunas", batal: "" };

const nomorWa = (hp: string | null) => (hp ? hp.replace(/\D/g, "").replace(/^0/, "62") : "");

/** Tautan WhatsApp dengan pesan terisi. Admin yang menekan kirim — tidak ada pengiriman otomatis. */
export function waNota(o: {
  hp: string | null; status: NotaStatus; customer: string; layanan: string; tanggal: string | null; jam: string | null;
  total: number; dibayar: number; sisa: number; dpDiminta?: number | null; link: string; cabang: string | null;
}) {
  const kapan = o.tanggal ? ` pada ${tgl(o.tanggal, { weekday: "long", day: "numeric", month: "long" })}${o.jam ? ` jam ${o.jam}` : ""}` : "";
  const isi: Record<NotaStatus, string> = {
    tagihan: `berikut tagihan untuk ${o.layanan}${kapan}. ${o.dpDiminta ? `DP yang perlu dibayar ${rp(o.dpDiminta)} dari total ${rp(o.total)}.` : `Total ${rp(o.total)}.`}`,
    tanda_jadi: `DP ${rp(o.dibayar)} sudah kami terima. Ini tanda jadi untuk ${o.layanan}${kapan}. Sisa pembayaran ${rp(o.sisa)}.`,
    lunas: `pembayaran untuk ${o.layanan}${kapan} sudah lunas (${rp(o.total)}). Berikut buktinya.`,
    batal: `booking ${o.layanan}${kapan} sudah dibatalkan.`,
  };
  const teks = `Halo kak ${o.customer}, ${isi[o.status]}\n\nNota: ${o.link}\n\nTerima kasih.\nMS Studio${o.cabang ? ` ${o.cabang}` : ""}`;
  return `https://wa.me/${nomorWa(o.hp)}?text=${encodeURIComponent(teks)}`;
}
