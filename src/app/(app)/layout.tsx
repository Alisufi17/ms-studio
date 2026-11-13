import Link from "next/link";
import { getSession } from "@/lib/session";
import { getPengingat, labelH, selisihHari } from "@/lib/pengingat";
import { Shell } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { sb, profile, isOwner, cabang, cabangList } = await getSession();
  const [{ count: pesanan }, { count: booking }, ingat] = await Promise.all([
    sb.from("orders").select("id", { count: "exact", head: true }).eq("cabang", cabang).in("status", ["Menunggu", "Menunggu Verifikasi"]),
    sb.from("booking").select("id", { count: "exact", head: true }).eq("status", "Pending"),
    getPengingat(sb),
  ]);
  const menu = [
    ...(isOwner ? [{ href: "/", label: "Ringkasan", icon: "📊" }] : []),
    { href: "/kasir", label: "Kasir", icon: "🧾", badge: pesanan ?? 0 },
    { href: "/booking", label: "Booking", icon: "📅", badge: booking ?? 0 },
    { href: "/job", label: "Job Luar", icon: "🎥", badge: ingat.jobs.length },
    { href: "/hasil", label: "Hasil Edit", icon: "🖼️", badge: ingat.telat.length + ingat.segera.length },
    { href: "/kas", label: "Buku Kas", icon: "💰" },
    ...(isOwner ? [{ href: "/katalog", label: "Katalog", icon: "🏷️" }, { href: "/akun", label: "Akun", icon: "👥" }] : []),
  ];
  const milikku = (pic: string | null) => pic === profile.nama;
  return (
    <Shell menu={menu} nama={profile.nama} role={profile.role} cabang={cabang} cabangList={cabangList.map((c) => c.nama)}>
      {(ingat.telat.length > 0 || ingat.segera.length > 0 || ingat.jobs.length > 0) && (
        <div className="no-print mb-4 space-y-1.5" role="alert">
          {ingat.telat.length > 0 && (
            <Link href="/hasil" className="block rounded-xl border border-bad/30 bg-bad-soft px-3.5 py-2.5 text-[13px] font-semibold text-bad">
              🔴 {ingat.telat.length} hasil edit TELAT dikirim{ingat.telat.some((x) => milikku(x.pic)) ? ` — ${ingat.telat.filter((x) => milikku(x.pic)).length} tanggung jawabmu` : ""}:{" "}
              <span className="font-normal">{ingat.telat.slice(0, 3).map((x) => `${x.customer} (${labelH(selisihHari(x.tenggat))}${x.pic ? ", " + x.pic : ""})`).join(" · ")}{ingat.telat.length > 3 ? " · …" : ""}</span>
            </Link>
          )}
          {ingat.segera.length > 0 && (
            <Link href="/hasil" className="block rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-[13px] font-semibold text-warn">
              🟡 {ingat.segera.length} hasil edit harus dikirim paling lambat besok:{" "}
              <span className="font-normal">{ingat.segera.slice(0, 3).map((x) => `${x.customer} (${labelH(selisihHari(x.tenggat))}${x.pic ? ", " + x.pic : ""})`).join(" · ")}{ingat.segera.length > 3 ? " · …" : ""}</span>
            </Link>
          )}
          {ingat.jobs.map((j) => (
            <Link key={j.id} href="/job" className="block rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-semibold">
              🎥 Job luar {labelH(selisihHari(j.tanggal))}: {j.klien} <span className="font-normal text-muted">· {j.jenis}{j.jam ? ` · ${j.jam}` : ""}{j.lokasi ? ` · ${j.lokasi}` : ""} — cek alat, tim & transport</span>
            </Link>
          ))}
        </div>
      )}
      {children}
    </Shell>
  );
}
