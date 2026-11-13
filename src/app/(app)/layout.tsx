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
    ...(isOwner ? [{ href: "/", label: "Ringkasan", icon: "chart" }] : []),
    { href: "/kasir", label: "Kasir", icon: "cart", badge: pesanan ?? 0 },
    { href: "/booking", label: "Booking", icon: "calendar", badge: booking ?? 0 },
    { href: "/job", label: "Job Luar", icon: "truck", badge: ingat.jobs.length },
    { href: "/hasil", label: "Hasil Edit", icon: "image", badge: ingat.telat.length + ingat.segera.length },
    { href: "/kas", label: "Buku Kas", icon: "wallet" },
    ...(isOwner ? [{ href: "/katalog", label: "Katalog", icon: "tag" }, { href: "/akun", label: "Akun", icon: "users" }] : []),
  ];
  const milikku = (pic: string | null) => pic === profile.nama;
  const ringkas = (x: { customer: string; tenggat: string; pic: string | null }) => `${x.customer} (${labelH(selisihHari(x.tenggat))}${x.pic ? ", " + x.pic : ""})`;
  return (
    <Shell menu={menu} nama={profile.nama} role={profile.role} cabang={cabang} cabangList={cabangList.map((c) => c.nama)}>
      {(ingat.telat.length > 0 || ingat.segera.length > 0 || ingat.jobs.length > 0) && (
        <div className="no-print mb-5 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-[13px]" role="alert">
          {ingat.telat.length > 0 && (
            <Link href="/hasil" className="flex items-baseline gap-2.5 px-3.5 py-2.5 hover:bg-soft">
              <span className="dot translate-y-[-1px] bg-bad" />
              <span><b className="text-bad">{ingat.telat.length} hasil edit telat dikirim</b>
                {ingat.telat.some((x) => milikku(x.pic)) && <span className="text-bad"> ({ingat.telat.filter((x) => milikku(x.pic)).length} tanggung jawabmu)</span>}
                <span className="text-muted"> — {ingat.telat.slice(0, 3).map(ringkas).join(", ")}{ingat.telat.length > 3 ? ", …" : ""}</span></span>
            </Link>
          )}
          {ingat.segera.length > 0 && (
            <Link href="/hasil" className="flex items-baseline gap-2.5 px-3.5 py-2.5 hover:bg-soft">
              <span className="dot translate-y-[-1px] bg-warn" />
              <span><b>{ingat.segera.length} hasil edit harus dikirim paling lambat besok</b>
                <span className="text-muted"> — {ingat.segera.slice(0, 3).map(ringkas).join(", ")}{ingat.segera.length > 3 ? ", …" : ""}</span></span>
            </Link>
          )}
          {ingat.jobs.map((j) => (
            <Link key={j.id} href="/job" className="flex items-baseline gap-2.5 px-3.5 py-2.5 hover:bg-soft">
              <span className="dot translate-y-[-1px] bg-ink" />
              <span><b>Job luar {labelH(selisihHari(j.tanggal))}: {j.klien}</b>
                <span className="text-muted"> — {[j.jenis, j.jam, j.lokasi].filter(Boolean).join(", ")}. Cek alat, tim, dan transport.</span></span>
            </Link>
          ))}
        </div>
      )}
      {children}
    </Shell>
  );
}
