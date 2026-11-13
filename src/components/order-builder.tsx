"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { rp } from "@/lib/format";

export type CatalogItem = {
  id: string; category: string; name: string; description: string | null; price: number; original_price: number | null;
  item_type: string; included_people: number; extra_person_price: number; max_people: number; applies_to: string | null;
};
export type OrderPayload = { customer: string; phone: string; metode: string; notes: string; items: { id: string; qty: number; people: number | null }[] };
export type OrderResult = { ok?: string; err?: string; order?: { order_no: string; total: number; status?: string; payment_method?: string; customer_name?: string } };

type Line = { id: string; qty: number; people: number | null };

const unit = (p: CatalogItem, people: number | null) =>
  Number(p.price) + Math.max(0, (people ?? 0) - (p.included_people || 0)) * Number(p.extra_person_price || 0);

const peopleLabel = (p: CatalogItem) =>
  !p.included_people
    ? p.applies_to ? `Untuk ${p.applies_to}` : "Tambahan"
    : `Termasuk ${p.included_people} orang` + (Number(p.extra_person_price) > 0 ? ` · +${rp(p.extra_person_price)}/orang` : "");

export function OrderBuilder({
  items, mode, submit, qris, branch,
}: {
  items: CatalogItem[]; mode: "kasir" | "public"; branch: string;
  submit: (p: OrderPayload) => Promise<OrderResult>;
  qris?: { image: string; note: string };
}) {
  const [cat, setCat] = useState("Semua");
  const [cart, setCart] = useState<Line[]>([]);
  const [picker, setPicker] = useState<{ item: CatalogItem; people: number } | null>(null);
  const [metode, setMetode] = useState("Cash");
  const [form, setForm] = useState({ customer: "", phone: "", notes: "" });
  const [msg, setMsg] = useState<OrderResult>({});
  const [done, setDone] = useState<OrderResult["order"] | null>(null);
  const [pending, start] = useTransition();
  const cartRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const cats = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const shown = items.filter((i) => cat === "Semua" || i.category === cat);
  const lines = cart.flatMap((l) => { const p = byId.get(l.id); return p ? [{ ...l, p, u: unit(p, l.people) }] : []; });
  const total = lines.reduce((n, l) => n + l.u * l.qty, 0);
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const addons = lines.some((l) => l.p.item_type !== "addon")
    ? items.filter((i) => i.item_type === "addon" && !cart.some((l) => l.id === i.id)).slice(0, 4)
    : [];

  const add = (id: string, people: number | null) =>
    setCart((c) => {
      const i = c.findIndex((l) => l.id === id && l.people === people);
      return i >= 0 ? c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l)) : [...c, { id, qty: 1, people }];
    });
  const bump = (idx: number, d: number) =>
    setCart((c) => c.map((l, j) => (j === idx ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0));
  const pick = (p: CatalogItem) =>
    Number(p.extra_person_price) > 0 ? setPicker({ item: p, people: p.included_people || 1 }) : add(p.id, p.included_people || null);

  function send() {
    setMsg({});
    if (!cart.length) return setMsg({ err: "Pilih minimal satu paket." });
    if (form.customer.trim().length < 2) return setMsg({ err: "Isi nama customer." });
    if (mode === "public" && form.phone.replace(/\D/g, "").length < 9) return setMsg({ err: "Isi nomor WhatsApp yang benar." });
    start(async () => {
      const r = await submit({ ...form, metode, items: cart });
      if (r.err) return setMsg(r);
      setCart([]); setForm({ customer: "", phone: "", notes: "" }); setMetode("Cash");
      if (mode === "public") setDone(r.order ?? null);
      else setMsg({ ok: r.ok });
    });
  }

  if (done)
    return (
      <div className="card mx-auto mt-10 max-w-md p-7 text-center">
        <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-ok-soft text-2xl font-black text-ok">✓</div>
        <h1 className="h1">Terima kasih, {done.customer_name}</h1>
        <p className="sub">Tunjukkan nomor ini ke karyawan MS Studio {branch}.</p>
        <div className="my-4 rounded-xl bg-soft p-4 text-2xl font-black tracking-wide">{done.order_no}</div>
        <p className="mb-4 text-sm">Total <b className="num">{rp(done.total)}</b> · {done.payment_method}</p>
        <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-xs font-semibold text-warn">
          {done.payment_method === "QRIS" ? "Bayar QRIS lalu tunjukkan bukti ke karyawan." : "Silakan bayar cash di kasir."}
        </p>
        <button className="btn-ghost w-full" onClick={() => setDone(null)}>Buat pesanan baru</button>
      </div>
    );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0">
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {["Semua", ...cats].map((c) => (
            <button key={c} type="button" className={cat === c ? "chip-on" : "chip"} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        {!shown.length && <p className="sub py-8 text-center">Belum ada paket aktif di kategori ini.</p>}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((p) => (
            <button key={p.id} type="button" onClick={() => pick(p)}
              className="flex cursor-pointer flex-col rounded-2xl border border-line bg-surface p-3 text-left transition hover:border-rose">
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-rose">{p.category}</span>
              <b className="mt-0.5 text-[13.5px] leading-tight">{p.name}</b>
              <span className="mt-1 flex-1 text-[11px] leading-snug text-muted">
                {(p.description ?? "").split("\n").filter(Boolean).slice(0, mode === "public" ? 4 : 2).map((d, i) => <span key={i} className="block">· {d}</span>)}
              </span>
              <span className="mt-1.5 text-[10.5px] font-semibold text-muted">{peopleLabel(p)}</span>
              <span className="mt-1 flex items-baseline gap-1.5">
                <b className="num text-[15px]">{rp(p.price)}</b>
                {Number(p.original_price) > Number(p.price) && <del className="num text-[10.5px] text-muted">{rp(p.original_price)}</del>}
              </span>
            </button>
          ))}
        </div>
      </section>

      <aside ref={cartRef} className="card lg:sticky lg:top-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold">{mode === "public" ? "Pesanan saya" : "Keranjang"} <span className="sub font-semibold">· {count} item</span></h2>
          {cart.length > 0 && <button type="button" className="cursor-pointer text-xs font-bold text-rose" onClick={() => setCart([])}>Kosongkan</button>}
        </div>
        {!lines.length && <p className="sub py-6 text-center">Belum ada paket dipilih.</p>}
        {lines.map((l, i) => (
          <div key={l.id + l.people} className="flex items-center gap-2 border-b border-line py-2 last:border-0">
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[12.5px]">{l.p.name}</b>
              <span className="text-[11px] text-muted">{l.p.category}{l.people ? ` · ${l.people} orang` : ""}</span>
            </div>
            <button type="button" aria-label="Kurangi" className="size-7 cursor-pointer rounded-lg bg-soft font-black" onClick={() => bump(i, -1)}>−</button>
            <b className="num w-4 text-center text-xs">{l.qty}</b>
            <button type="button" aria-label="Tambah" className="size-7 cursor-pointer rounded-lg bg-soft font-black" onClick={() => bump(i, 1)}>+</button>
            <b className="num w-20 text-right text-[12.5px]">{rp(l.u * l.qty)}</b>
          </div>
        ))}
        {addons.length > 0 && (
          <div className="mt-2 rounded-xl bg-soft p-2.5">
            <b className="text-[11.5px]">Tambahan</b>
            <div className="mt-1.5 grid gap-1">
              {addons.map((p) => (
                <button key={p.id} type="button" onClick={() => pick(p)} className="flex cursor-pointer items-center justify-between rounded-lg bg-surface px-2.5 py-1.5 text-left text-[11.5px] font-semibold">
                  <span className="truncate">{p.name}</span><span className="num shrink-0 pl-2 text-rose">+ {rp(p.price)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between border-t-2 border-line pt-3">
          <span className="sub font-bold">Total</span><b className="num text-xl">{rp(total)}</b>
        </div>
        <div className="mt-3 space-y-2">
          <input className="input" placeholder={mode === "public" ? "Nama *" : "Nama customer *"} autoComplete="name" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
          <input className="input" placeholder={mode === "public" ? "Nomor WhatsApp *" : "No. WhatsApp (opsional)"} inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="Catatan (opsional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="grid grid-flow-col gap-1.5">
            {(mode === "public" ? ["Cash", "QRIS"] : ["Cash", "QRIS", "Transfer"]).map((m) => (
              <button key={m} type="button" onClick={() => setMetode(m)}
                className={`cursor-pointer rounded-xl border-2 py-2 text-xs font-extrabold ${metode === m ? "border-rose bg-rose-soft text-rose" : "border-line bg-surface"}`}>{m}</button>
            ))}
          </div>
          {metode === "QRIS" && qris && (
            <div className="rounded-xl border border-line p-3 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qris.image ? <img src={qris.image} alt={`QRIS MS Studio ${branch}`} className="mx-auto max-h-56 rounded-lg" /> : <p className="sub py-4">QRIS dibayar di kasir</p>}
              <p className="sub mt-1 text-[11px]">{qris.note || "Tunjukkan bukti pembayaran ke karyawan."}</p>
            </div>
          )}
          {msg.err && <p className="rounded-lg bg-bad-soft px-3 py-2 text-xs font-semibold text-bad">{msg.err}</p>}
          {msg.ok && <p className="rounded-lg bg-ok-soft px-3 py-2 text-xs font-semibold text-ok">{msg.ok}</p>}
          <button type="button" className="btn-primary w-full py-3" disabled={pending || !cart.length} onClick={send}>
            {pending ? "Menyimpan…" : mode === "public" ? `Kirim pesanan · ${rp(total)}` : `Bayar & catat ${rp(total)}`}
          </button>
          <p className="sub text-center text-[11px]">
            {mode === "public" ? "Pesanan dihitung setelah pembayaran dikonfirmasi karyawan." : "Langsung masuk buku kas hari ini."}
          </p>
        </div>
      </aside>

      {count > 0 && (
        <div className="fixed inset-x-3 bottom-[4.5rem] z-30 flex items-center justify-between rounded-2xl bg-ink px-4 py-2.5 text-white shadow-xl lg:hidden"
          style={mode === "public" ? { bottom: "0.75rem" } : undefined}>
          <span><b className="block text-sm">{count} item</b><span className="num text-xs opacity-80">{rp(total)}</span></span>
          <button type="button" className="cursor-pointer rounded-lg bg-white px-3 py-2 text-xs font-extrabold text-ink" onClick={() => cartRef.current?.scrollIntoView({ behavior: "smooth" })}>Lihat keranjang</button>
        </div>
      )}

      {picker && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" onClick={(e) => e.target === e.currentTarget && setPicker(null)}>
          <div className="card w-full max-w-sm p-5">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-rose">{picker.item.category}</span>
            <h3 className="text-lg font-extrabold">{picker.item.name}</h3>
            <p className="sub mb-4">{peopleLabel(picker.item)}</p>
            <div className="mb-4 flex items-center justify-between rounded-xl border border-line p-3">
              <b>Berapa orang?</b>
              <div className="flex items-center gap-3">
                <button type="button" className="size-10 cursor-pointer rounded-xl bg-soft text-xl font-black" onClick={() => setPicker({ ...picker, people: Math.max(1, picker.people - 1) })}>−</button>
                <b className="num w-6 text-center text-xl">{picker.people}</b>
                <button type="button" className="size-10 cursor-pointer rounded-xl bg-soft text-xl font-black"
                  onClick={() => setPicker({ ...picker, people: Math.min(Math.max(picker.item.max_people || 30, picker.item.included_people), picker.people + 1) })}>+</button>
              </div>
            </div>
            <div className="mb-4 flex items-center justify-between rounded-xl bg-ink px-4 py-3 text-white">
              <span className="text-xs opacity-80">Harga paket</span><b className="num text-xl">{rp(unit(picker.item, picker.people))}</b>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setPicker(null)}>Batal</button>
              <button type="button" className="btn-primary flex-1" onClick={() => { add(picker.item.id, picker.people); setPicker(null); }}>Tambahkan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
