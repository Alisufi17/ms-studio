import { getSession } from "@/lib/session";
import { jam, rp, today } from "@/lib/format";
import { OrderBuilder, type CatalogItem } from "@/components/order-builder";
import { ActionButton } from "@/components/ui";
import { LiveRefresh } from "@/components/live-refresh";
import { batalkanPesanan, checkout, konfirmasiPesanan } from "../actions";

type Order = { id: string; order_no: string; customer_name: string; customer_phone: string; payment_method: string; total: number; status: string; notes: string; source: string; created_at: string };
type OrderItem = { order_id: string; item_name: string; qty: number; configuration: string | null };

export default async function KasirPage() {
  const { sb, cabang, isOwner } = await getSession();
  const mulaiHariIni = new Date(today() + "T00:00:00+07:00").toISOString();
  const [{ data: catalog }, { data: pending }, { data: hariIni }] = await Promise.all([
    sb.from("catalog_items").select("id,category,name,description,price,original_price,item_type,included_people,extra_person_price,max_people,applies_to")
      .eq("cabang", cabang).eq("active", true).order("sort_order").order("name"),
    sb.from("orders").select("*").eq("cabang", cabang).in("status", ["Menunggu", "Menunggu Verifikasi"]).order("created_at"),
    sb.from("orders").select("*").eq("cabang", cabang).eq("status", "Dibayar").gte("paid_at", mulaiHariIni).order("paid_at", { ascending: false }).limit(100),
  ]);
  const orders = [...((pending ?? []) as Order[]), ...((hariIni ?? []) as Order[])];
  const { data: items } = orders.length
    ? await sb.from("order_items").select("order_id,item_name,qty,configuration").in("order_id", orders.map((o) => o.id))
    : { data: [] as OrderItem[] };
  const isi = (id: string) => ((items ?? []) as OrderItem[]).filter((i) => i.order_id === id).map((i) => `${i.qty}× ${i.item_name}${i.configuration ? ` (${i.configuration})` : ""}`).join(", ");
  const totalHariIni = ((hariIni ?? []) as Order[]).reduce((n, o) => n + Number(o.total), 0);

  return (
    <>
      <LiveRefresh />
      <div className="mb-4">
        <h1 className="h1">Kasir · {cabang}</h1>
        <p className="sub">Pilih paket, terima pembayaran. Pesanan dari QR muncul otomatis di bawah.</p>
      </div>

      {(pending ?? []).length > 0 && (
        <section className="card mb-4 border-warn/40 bg-warn-soft/40">
          <h2 className="mb-2 text-[15px] font-extrabold">Pesanan QR menunggu <span className="pill-warn ml-1">{pending!.length}</span></h2>
          <div className="grid gap-2.5 md:grid-cols-2">
            {(pending as Order[]).map((o) => (
              <article key={o.id} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <b className="block truncate">{o.customer_name}</b>
                    <span className="sub text-xs">{o.order_no} · {jam(o.created_at)} · {o.customer_phone || "tanpa nomor"}</span>
                  </div>
                  <b className="num text-base">{rp(o.total)}</b>
                </div>
                <p className="mt-1.5 text-xs text-muted">{isi(o.id)}{o.notes ? ` · Catatan: ${o.notes}` : ""}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {["Cash", "QRIS"].map((m) => (
                    <ActionButton key={m} action={konfirmasiPesanan.bind(null, o.id, m)} className={`${o.payment_method === m ? "btn-ok" : "btn-ghost"} btn-sm`}>
                      ✓ Terima {m}
                    </ActionButton>
                  ))}
                  <ActionButton action={batalkanPesanan.bind(null, o.id)} className="btn-danger btn-sm" confirm="Batalkan pesanan ini?">Batalkan</ActionButton>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <OrderBuilder items={(catalog ?? []) as CatalogItem[]} mode="kasir" branch={cabang} submit={checkout} />

      <details className="card mt-4">
        <summary className="flex items-center justify-between">
          <span className="text-[15px] font-extrabold">Pesanan lunas hari ini <span className="sub font-semibold">· {(hariIni ?? []).length} pesanan</span></span>
          <b className="num">{rp(totalHariIni)}</b>
        </summary>
        <div className="mt-2 divide-y divide-line">
          {((hariIni ?? []) as Order[]).map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
              <span className="num w-11 text-muted">{jam(o.created_at)}</span>
              <span className="min-w-0 flex-1"><b>{o.customer_name}</b> <span className="text-muted">· {isi(o.id)}</span></span>
              <span className={o.payment_method === "Cash" ? "pill-ok" : "pill-warn"}>{o.payment_method}</span>
              <b className="num w-24 text-right">{rp(o.total)}</b>
              {isOwner && <ActionButton action={batalkanPesanan.bind(null, o.id)} className="btn-danger btn-sm" confirm={`Batalkan ${o.order_no}? Uangnya ikut dihapus dari buku kas.`}>Batalkan</ActionButton>}
            </div>
          ))}
          {!(hariIni ?? []).length && <p className="sub py-4 text-center">Belum ada pesanan lunas hari ini.</p>}
        </div>
      </details>
    </>
  );
}
