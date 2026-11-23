import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { rp, tgl } from "@/lib/format";
import { JUDUL, type NotaStatus } from "@/lib/nota";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nota MS Studio", robots: { index: false, follow: false } };

type Nota = {
  tipe: "booking" | "job"; nomor: string; status: NotaStatus; terbit: string; cabang: string | null; no_wa: string; qris_image: string; catatan_nota: string;
  customer: string; layanan: string | null; paket: string | null; tanggal: string | null; jam: string | null; lokasi: string | null;
  total: number; dibayar: number; sisa: number; dp_diminta: number | null; tanggal_bayar: string | null;
};

const PESAN: Record<NotaStatus, string> = {
  tagihan: "Silakan lakukan pembayaran lalu kirim buktinya ke kami. Jadwal terkunci setelah pembayaran kami terima.",
  tanda_jadi: "DP sudah kami terima. Jadwal Anda sudah terkunci.",
  lunas: "Pembayaran sudah lunas. Terima kasih.",
  batal: "Pesanan ini sudah dibatalkan.",
};

export default async function NotaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("get_nota", { p_token: token });
  if (error || !data) notFound();
  const n = data as Nota;
  const baris: [string, string | null][] = [
    ["Atas nama", n.customer], ["Layanan", [n.layanan, n.paket && n.paket !== n.layanan ? n.paket : null].filter(Boolean).join(" · ")],
    ["Tanggal", n.tanggal ? tgl(n.tanggal, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : null], ["Jam", n.jam],
    ["Lokasi", n.lokasi], ["Cabang", n.cabang],
  ];
  const dpDulu = n.status === "tagihan" && !!n.dp_diminta && n.dp_diminta < n.total;
  const hp = n.no_wa.startsWith("62") ? "0" + n.no_wa.slice(2) : n.no_wa;
  const warna = n.status === "lunas" ? "bg-ok-soft text-ok" : n.status === "batal" ? "bg-bad-soft text-bad" : n.status === "tanda_jadi" ? "bg-soft text-ink" : "bg-warn-soft text-warn";

  return (
    <main className="mx-auto max-w-lg px-4 py-8 print:py-0">
      <article className="rounded-lg border border-line bg-surface p-6 print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="text-sm font-semibold tracking-tight">MS Studio{n.cabang ? ` ${n.cabang}` : ""}</p>
            <p className="sub text-xs">{n.nomor} · terbit {tgl(n.terbit.slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          <span className={`rounded px-2 py-1 text-xs font-medium ${warna}`}>{JUDUL[n.status]}</span>
        </header>

        <dl className="divide-y divide-line text-[13.5px]">
          {baris.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>
          ))}
        </dl>

        <section className="mt-2 space-y-1.5 rounded-md bg-soft p-4 text-[13.5px]">
          <div className="flex justify-between"><span className="text-muted">Total</span><span className="num">{rp(n.total)}</span></div>
          {n.dibayar > 0 && <div className="flex justify-between"><span className="text-muted">Sudah dibayar{n.tanggal_bayar ? ` (${tgl(n.tanggal_bayar, { day: "numeric", month: "short" })})` : ""}</span><span className="num">{rp(n.dibayar)}</span></div>}
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
            <span>{dpDulu ? "Bayar DP sekarang" : n.status === "tagihan" ? "Total tagihan" : "Sisa pembayaran"}</span>
            <span className="num">{rp(dpDulu ? n.dp_diminta! : n.sisa)}</span>
          </div>
          {dpDulu && <p className="text-xs text-muted">Sisa {rp(n.total - n.dp_diminta!)} dibayar kemudian.</p>}
        </section>

        <p className="mt-4 text-[13px]">{PESAN[n.status]}</p>

        {n.status === "tagihan" && n.qris_image && (
          <div className="mt-4 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={n.qris_image} alt={`QRIS MS Studio ${n.cabang ?? ""}`} className="mx-auto max-h-64 rounded-md border border-line" />
            <p className="sub mt-1 text-xs">Scan QRIS untuk membayar</p>
          </div>
        )}

        <footer className="mt-5 border-t border-line pt-3 text-xs text-muted">
          <p>{n.catatan_nota || "Simpan nota ini sebagai bukti. Hubungi kami bila ada perubahan jadwal."}</p>
          {hp && <p className="mt-1">Hubungi kami: {hp}</p>}
        </footer>
      </article>
      <div className="no-print mt-4 flex justify-center"><PrintButton /></div>
    </main>
  );
}
