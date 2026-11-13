import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { requireOwner } from "@/lib/session";
import { rp } from "@/lib/format";
import { ActionButton, ActionForm, MoneyInput } from "@/components/ui";
import { simpanKatalog, simpanQris, toggleKatalog } from "../actions";

type Item = {
  id: string; cabang: string; category: string; name: string; description: string | null; price: number; original_price: number | null; item_type: string;
  included_people: number; extra_person_price: number; max_people: number; applies_to: string | null; sort_order: number; active: boolean;
};

function FormItem({ item, cabang, kategori }: { item?: Item; cabang: string; kategori: string[] }) {
  return (
    <ActionForm action={simpanKatalog} submit={item ? "Simpan perubahan" : "Tambah paket"} className="grid gap-2 sm:grid-cols-2" submitClass="btn-primary sm:col-span-2">
      {item && <input type="hidden" name="rid" value={item.id} />}
      <input type="hidden" name="cabang" value={cabang} />
      <div><label className="label">Kategori *</label><input name="category" list="kategori" defaultValue={item?.category} className="input" required />
        <datalist id="kategori">{kategori.map((k) => <option key={k}>{k}</option>)}</datalist></div>
      <div><label className="label">Nama paket *</label><input name="name" defaultValue={item?.name} className="input" required /></div>
      <div><label className="label">Harga jual *</label><MoneyInput name="price" defaultValue={item ? Number(item.price) : undefined} required /></div>
      <div><label className="label">Harga coret (opsional)</label><MoneyInput name="original_price" defaultValue={Number(item?.original_price) || undefined} /></div>
      <div><label className="label">Jenis</label>
        <select name="item_type" defaultValue={item?.item_type ?? "package"} className="input"><option value="package">Paket utama</option><option value="addon">Tambahan</option></select></div>
      <div><label className="label">Urutan tampil</label><input name="sort_order" inputMode="numeric" defaultValue={item?.sort_order ?? 1} className="input" /></div>
      <div><label className="label">Harga termasuk berapa orang (0 = tidak dihitung)</label><input name="included_people" inputMode="numeric" defaultValue={item?.included_people ?? 0} className="input" /></div>
      <div><label className="label">Tambah per orang</label><MoneyInput name="extra_person_price" defaultValue={Number(item?.extra_person_price) || undefined} /></div>
      <div><label className="label">Maksimal orang</label><input name="max_people" inputMode="numeric" defaultValue={item?.max_people || 30} className="input" /></div>
      <div><label className="label">Tambahan ini cocok untuk</label><input name="applies_to" defaultValue={item?.applies_to ?? ""} className="input" placeholder="mis. Semua paket" /></div>
      <div className="sm:col-span-2"><label className="label">Yang didapat customer (satu poin per baris)</label><textarea name="description" rows={4} defaultValue={item?.description ?? ""} className="input" /></div>
      <label className="flex items-center gap-2 text-[13px] font-medium"><input type="checkbox" name="active" defaultChecked={item?.active ?? true} /> Tampil di kasir & halaman QR</label>
      {!item && <label className="flex items-center gap-2 text-[13px] font-medium"><input type="checkbox" name="semua_cabang" /> Buat juga di semua cabang</label>}
    </ActionForm>
  );
}

export default async function KatalogPage({ searchParams }: { searchParams: Promise<{ cabang?: string }> }) {
  const sp = await searchParams;
  const { sb, cabangList, cabang: kerja } = await requireOwner();
  const cab = cabangList.find((c) => c.nama === sp.cabang) ?? cabangList.find((c) => c.nama === kerja) ?? cabangList[0];
  const { data } = await sb.from("catalog_items").select("*").eq("cabang", cab.nama).order("sort_order").order("name");
  const items = (data ?? []) as Item[];
  const kategori = [...new Set(items.map((i) => i.category))];
  const h = await headers();
  const link = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/pesan/${cab.kode.toLowerCase()}`;
  const qr = await QRCode.toString(link, { type: "svg", margin: 1, width: 180 });

  return (
    <>
      <div className="mb-3"><h1 className="h1">Katalog</h1><p className="sub">Harga di sini dipakai kasir dan halaman pesan QR. {items.filter((i) => i.active).length} aktif dari {items.length}.</p></div>
      <div className="no-print mb-4 flex gap-1.5">
        {cabangList.map((c) => <Link key={c.nama} href={`/katalog?cabang=${c.nama}`} className={c.nama === cab.nama ? "chip-on" : "chip"}>{c.nama}</Link>)}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        <details className="card no-print self-start">
          <summary className="h2">+ Tambah paket · {cab.nama}</summary>
          <div className="mt-3"><FormItem cabang={cab.nama} kategori={kategori} /></div>
        </details>
        <section className="card text-center">
          <h2 className="h2">QR pesan mandiri · {cab.nama}</h2>
          <div className="mx-auto my-2 w-[180px]" dangerouslySetInnerHTML={{ __html: qr }} />
          <a href={link} target="_blank" rel="noreferrer" className="block break-all text-[11px] text-muted underline">{link}</a>
          <details className="no-print mt-3 text-left">
            <summary className="btn-ghost btn-sm w-full">Atur gambar QRIS pembayaran</summary>
            <ActionForm action={simpanQris} submit="Simpan QRIS" className="mt-2 space-y-2" submitClass="btn-primary btn-sm w-full">
              <input type="hidden" name="nama" value={cab.nama} />
              <input name="qris_image" defaultValue={cab.qris_image} placeholder="https://… alamat gambar QRIS" className="input" />
              <input name="qris_note" defaultValue={cab.qris_note} placeholder="Catatan untuk customer" className="input" />
            </ActionForm>
          </details>
        </section>
      </div>

      {kategori.map((k) => (
        <section key={k} className="card no-print mb-3">
          <h2 className="mb-1 text-xs font-medium text-muted">{k}</h2>
          <div className="divide-y divide-line">
            {items.filter((i) => i.category === k).map((i) => (
              <details key={i.id} className={i.active ? "" : "opacity-55"}>
                <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
                  <span className="min-w-0 flex-1"><b>{i.name}</b>{i.item_type === "addon" && <span className="pill-mute ml-1.5">tambahan</span>}
                    {i.included_people > 0 && <span className="block text-[11px] text-muted">termasuk {i.included_people} orang{Number(i.extra_person_price) > 0 ? ` · +${rp(i.extra_person_price)}/orang` : ""}</span>}</span>
                  <b className="num">{rp(i.price)}</b>
                  <ActionButton action={toggleKatalog.bind(null, i.id, !i.active)} className="btn-ghost btn-sm">{i.active ? "Sembunyikan" : "Tampilkan"}</ActionButton>
                  <span className="btn-ghost btn-sm">Ubah</span>
                </summary>
                <div className="pb-4 pt-1"><FormItem item={i} cabang={cab.nama} kategori={kategori} /></div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
