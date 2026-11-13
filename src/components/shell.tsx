"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { logout, setCabang } from "@/app/(app)/actions";

type Menu = { href: string; label: string; icon: string; badge?: number };

export function Shell({
  menu, nama, role, cabang, cabangList, children,
}: {
  menu: Menu[]; nama: string; role: string; cabang: string; cabangList: string[]; children: React.ReactNode;
}) {
  const path = usePathname();
  const [pending, start] = useTransition();
  const on = (href: string) => path === href || (href !== "/" && path.startsWith(href + "/"));
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[210px_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-2.5 p-5">
          <div className="grid size-9 place-items-center rounded-xl bg-rose font-extrabold text-white">M</div>
          <b className="text-[15px]">MS Studio</b>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {menu.map((m) => (
            <Link key={m.href} href={m.href}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold ${on(m.href) ? "bg-rose text-white" : "text-ink hover:bg-soft"}`}>
              <span className="w-5 text-center">{m.icon}</span>{m.label}
              {!!m.badge && <span className={`ml-auto rounded-full px-1.5 text-[10.5px] font-extrabold ${on(m.href) ? "bg-white text-rose" : "bg-warn text-white"}`}>{m.badge}</span>}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-4 text-xs">
          <b className="block text-[13px]">{nama}</b>
          <span className="text-muted">{role === "pemilik" ? "Pemilik" : "Admin"}</span>
          <form action={logout}><button className="mt-2 cursor-pointer font-bold text-bad">Keluar</button></form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur">
          <label className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-xs font-bold text-muted">
            Cabang kerja
            <select aria-label="Cabang kerja" className="cursor-pointer rounded-full bg-soft px-2 py-1.5 text-[13px] font-extrabold text-ink outline-none" value={cabang} disabled={pending}
              onChange={(e) => start(() => setCabang(e.target.value))}>
              {cabangList.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <span className="ml-auto text-xs font-semibold text-muted lg:hidden">{nama}</span>
          <form action={logout} className="lg:hidden"><button className="cursor-pointer text-xs font-bold text-bad">Keluar</button></form>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 lg:pb-12">{children}</main>
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-line bg-surface lg:hidden">
        {menu.map((m) => (
          <Link key={m.href} href={m.href} className={`relative flex min-w-[4.4rem] flex-1 flex-col items-center gap-0.5 whitespace-nowrap py-2 text-[10px] font-bold ${on(m.href) ? "text-rose" : "text-muted"}`}>
            <span className="text-lg leading-none">{m.icon}</span>{m.label}
            {!!m.badge && <span className="absolute right-[22%] top-1 rounded-full bg-warn px-1 text-[9px] font-extrabold text-white">{m.badge}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
