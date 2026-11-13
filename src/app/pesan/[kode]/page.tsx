import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { OrderBuilder, type CatalogItem } from "@/components/order-builder";
import { kirimPesanan } from "./actions";

export const revalidate = 60; // katalog publik di-cache 1 menit

export default async function PesanPage({ params }: { params: Promise<{ kode: string }> }) {
  const { kode } = await params;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: cabangList } = await sb.from("cabang").select("nama,kode,qris_image,qris_note").eq("aktif", true);
  const key = decodeURIComponent(kode).toLowerCase();
  const cab = (cabangList ?? []).find((c) => c.kode.toLowerCase() === key || c.nama.toLowerCase() === key);
  if (!cab) notFound();
  const { data: catalog } = await sb.from("catalog_items")
    .select("id,category,name,description,price,original_price,item_type,included_people,extra_person_price,max_people,applies_to")
    .eq("cabang", cab.nama).eq("active", true).order("sort_order").order("name");

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-5">
      <header className="mb-5 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-md bg-rose text-xl font-medium text-white">M</div>
        <div><b className="block text-base">MS Studio {cab.nama}</b><span className="sub text-xs">Pilih paket, isi nama, kirim ke kasir</span></div>
      </header>
      <h1 className="mb-4 text-2xl font-medium tracking-tight">Mau foto apa hari ini?</h1>
      <OrderBuilder items={(catalog ?? []) as CatalogItem[]} mode="public" branch={cab.nama} submit={kirimPesanan.bind(null, cab.nama)} qris={{ image: cab.qris_image, note: cab.qris_note }} />
    </main>
  );
}
