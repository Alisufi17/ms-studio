"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { logout, setCabang } from "@/app/(app)/actions";

type Menu = { href: string; label: string; icon: string; badge?: number };

// Ikon garis sederhana (24×24, stroke 1.6) supaya menu tidak bergantung pada emoji.
const ICON: Record<string, string> = {
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  cart: "M3 4h2l2.4 11h10.2L20 7H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  calendar: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  truck: "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  wallet: "M4 7h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h12M16 13h.01",
  tag: "M3 12V4h8l10 10-8 8L3 12Zm4.5-4.5h.01",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5m2 3a6 6 0 0 1 3 6",
};
const Icon = ({ name }: { name: string }) => (
  <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={ICON[name] ?? ""} />
  </svg>
);

export function Shell({
  menu, nama, role, cabang, cabangList, children,
}: {
  menu: Menu[]; nama: string; role: string; cabang: string; cabangList: string[]; children: React.ReactNode;
}) {
  const path = usePathname();
  const [pending, start] = useTransition();
  const on = (href: string) => path === href || (href !== "/" && path.startsWith(href + "/"));
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[220px_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="grid size-7 place-items-center rounded-md bg-rose text-xs font-semibold text-white">M</div>
          <span className="text-sm font-semibold tracking-tight">MS Studio</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {menu.map((m) => (
            <Link key={m.href} href={m.href}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] ${on(m.href) ? "bg-soft font-medium text-ink" : "text-muted hover:bg-soft hover:text-ink"}`}>
              <Icon name={m.icon} />{m.label}
              {!!m.badge && <span className="num ml-auto rounded bg-rose-soft px-1.5 text-[11px] font-medium text-rose">{m.badge}</span>}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line px-5 py-4 text-[13px]">
          <span className="block font-medium">{nama}</span>
          <span className="text-xs text-muted">{role === "pemilik" ? "Pemilik" : "Admin"}</span>
          <form action={logout}><button className="mt-2 cursor-pointer text-xs text-muted underline hover:text-ink">Keluar</button></form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur lg:px-8">
          <label className="flex items-center gap-2 text-xs text-muted">
            Cabang kerja
            <select aria-label="Cabang kerja" className="cursor-pointer rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] font-medium text-ink outline-none" value={cabang} disabled={pending}
              onChange={(e) => start(() => setCabang(e.target.value))}>
              {cabangList.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <span className="ml-auto text-xs text-muted lg:hidden">{nama}</span>
          <form action={logout} className="lg:hidden"><button className="cursor-pointer text-xs text-muted underline">Keluar</button></form>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 lg:px-8 lg:pb-12">{children}</main>
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-line bg-surface lg:hidden">
        {menu.map((m) => (
          <Link key={m.href} href={m.href} className={`relative flex min-w-[4.4rem] flex-1 flex-col items-center gap-1 whitespace-nowrap py-2 text-[10.5px] ${on(m.href) ? "font-medium text-ink" : "text-muted"}`}>
            <Icon name={m.icon} />{m.label}
            {!!m.badge && <span className="num absolute right-[20%] top-1 rounded bg-rose px-1 text-[9px] font-medium text-white">{m.badge}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
