import Link from "next/link";
import { getSession } from "@/lib/session";
import { addDays, isDate, rp, tgl, today } from "@/lib/format";
import { METODE } from "@/lib/constants";
import { ActionButton, ActionForm, MoneyInput } from "@/components/ui";
import { BookingForm } from "@/components/booking-form";
import { bayarBooking, statusBooking } from "../actions";

type B = {
  id: string; customer: string; no_hp: string | null; layanan: string | null; paket: string | null; ruang: string | null; cabang: string;
  tanggal_event: string | null; jam_event: string | null; total: number; dp: number; pelunasan: number; status: string; source: string | null;
  catatan: string | null; dp_transaction_id: string | null; jumlah_orang: number | null;
};

const pill: Record<string, string> = { Pending: "pill-warn", Aktif: "pill-mute", Lunas: "pill-ok", Selesai: "pill-mute", Batal: "pill-bad" };
const wa = (hp: string | null) => (hp ? "https://wa.me/" + hp.replace(/\D/g, "").replace(/^0/, "62") : null);

function Bayar({ b, stage, jumlah, label }: { b: B; stage: "DP" | "Pelunasan"; jumlah: number; label: string }) {
  return (
    <details className="basis-full sm:basis-auto">
      <summary className={`${stage === "DP" ? "btn-ok" : "btn-primary"} btn-sm`}>{label}</summary>
      <ActionForm action={bayarBooking} submit="Catat pembayaran" submitClass="btn-ok btn-sm" className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-soft p-2.5">
        <input type="hidden" name="rid" value={b.id} /><input type="hidden" name="stage" value={stage} />
        <div className="w-32"><MoneyInput name="jumlah" defaultValue={jumlah} /></div>
        <select name="metode" className="input w-28" defaultValue={stage === "DP" ? "QRIS" : "Cash"}>{METODE.map((m) => <option key={m}>{m}</option>)}</select>
      </ActionForm>
    </details>
  );
}

function Kartu({ b, semuaCabang }: { b: B; semuaCabang: boolean }) {
  // DP dari website baru "klaim" sampai kasir mengonfirmasi uangnya masuk
  const dibayar = (b.dp_transaction_id || b.status !== "Pending" ? b.dp || 0 : 0) + (b.pelunasan || 0);
  const sisa = Math.max(0, (b.total || 0) - dibayar);
  const link = wa(b.no_hp);
  return (
    <article className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <b className="num mr-2 text-[15px]">{b.jam_event?.slice(0, 5) ?? "—"}</b><b>{b.customer}</b>
          <span className="block text-xs text-muted">
            {b.layanan}{b.paket && b.paket !== b.layanan ? ` · ${b.paket}` : ""}{semuaCabang ? ` · ${b.cabang}` : ""}{b.source === "website" ? " · dari website" : ""}
          </span>
          {b.catatan && <span className="block text-xs text-muted">📝 {b.catatan}</span>}
        </div>
        <div className="shrink-0 text-right">
          <span className={pill[b.status] ?? "pill-mute"}>{b.status}</span>
          <b className="num mt-1 block text-[13px]">{rp(b.total)}</b>
          {sisa > 0 && b.status !== "Batal" && <span className="num block text-[11px] font-semibold text-warn">sisa {rp(sisa)}</span>}
        </div>
      </div>
      {!["Selesai", "Batal"].includes(b.status) && (
        <div className="no-print mt-2.5 flex flex-wrap items-start gap-1.5">
          {b.status === "Pending" && <Bayar b={b} stage="DP" jumlah={b.dp || 0} label="✓ DP masuk, kunci jadwal" />}
          {b.status === "Aktif" && <Bayar b={b} stage="Pelunasan" jumlah={sisa} label={`Lunasi ${rp(sisa)}`} />}
          {b.status === "Lunas" && <ActionButton action={statusBooking.bind(null, b.id, "Selesai")} className="btn-ok btn-sm">Tandai selesai</ActionButton>}
          {link && <a href={link} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">WhatsApp</a>}
          <ActionButton action={statusBooking.bind(null, b.id, "Batal")} className="btn-danger btn-sm" confirm={`Batalkan booking ${b.customer}? Jadwalnya dibuka lagi.`}>Batal</ActionButton>
        </div>
      )}
    </article>
  );
}

export default async function BookingPage({ searchParams }: { searchParams: Promise<{ tgl?: string; cabang?: string }> }) {
  const sp = await searchParams;
  const { sb, cabang: cabangKerja, cabangList } = await getSession();
  const t = today();
  const cabang = sp.cabang === "semua" ? null : cabangList.find((c) => c.nama === sp.cabang)?.nama ?? cabangKerja;
  const pilih = isDate(sp.tgl) ? sp.tgl : null;

  const cols = "id,customer,no_hp,layanan,paket,ruang,cabang,tanggal_event,jam_event,total,dp,pelunasan,status,source,catatan,dp_transaction_id,jumlah_orang";
  let pendingQ = sb.from("booking").select(cols).eq("status", "Pending").order("tanggal_event").order("jam_event").limit(100);
  let agendaQ = sb.from("booking").select(cols).order("tanggal_event").order("jam_event").limit(300);
  agendaQ = pilih ? agendaQ.eq("tanggal_event", pilih).neq("status", "Pending") : agendaQ.gte("tanggal_event", t).lte("tanggal_event", addDays(t, 30)).in("status", ["Aktif", "Lunas"]);
  if (cabang) { pendingQ = pendingQ.eq("cabang", cabang); agendaQ = agendaQ.eq("cabang", cabang); }
  let lewatQ = sb.from("booking").select(cols).in("status", ["Aktif", "Lunas"]).lt("tanggal_event", t).gte("tanggal_event", addDays(t, -30)).order("tanggal_event", { ascending: false }).limit(60);
  if (cabang) lewatQ = lewatQ.eq("cabang", cabang);
  const [{ data: p }, { data: a }, { data: l }] = await Promise.all([pendingQ, agendaQ, lewatQ]);
  const pending = (p ?? []) as B[], agenda = (a ?? []) as B[], lewat = pilih ? [] : ((l ?? []) as B[]);
  const hari = [...new Set(agenda.map((b) => b.tanggal_event!))];
  const url = (o: { tgl?: string; cabang?: string }) => {
    const q = new URLSearchParams({ ...(pilih ? { tgl: pilih } : {}), cabang: cabang ?? "semua", ...o });
    if (!q.get("tgl")) q.delete("tgl");
    return "/booking?" + q.toString();
  };
  const labelHari = (d: string) => (d === t ? "Hari ini · " : d === addDays(t, 1) ? "Besok · " : "") + tgl(d, { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <div className="mb-3">
        <h1 className="h1">Booking</h1>
        <p className="sub">{pilih ? labelHari(pilih) : "30 hari ke depan"} · {cabang ?? "Semua cabang"}</p>
      </div>

      <div className="no-print mb-4 flex flex-wrap items-center gap-1.5">
        {cabangList.map((c) => <Link key={c.nama} href={url({ cabang: c.nama })} className={cabang === c.nama ? "chip-on" : "chip"}>{c.nama}</Link>)}
        <Link href={url({ cabang: "semua" })} className={cabang ? "chip" : "chip-on"}>Semua cabang</Link>
        <form key={pilih ?? "agenda"} action="/booking" className="ml-auto flex items-center gap-1.5">
          <input type="hidden" name="cabang" value={cabang ?? "semua"} />
          <input type="date" name="tgl" defaultValue={pilih ?? ""} className="input w-40 py-1.5" aria-label="Lihat tanggal tertentu" />
          <button className="btn-ghost btn-sm">Lihat tanggal</button>
          {pilih && <Link href={url({ tgl: "" })} className="btn-ghost btn-sm">× Agenda</Link>}
        </form>
      </div>

      <details className="card no-print mb-4">
        <summary className="text-[15px] font-extrabold">＋ Booking baru <span className="sub font-semibold">· {cabangKerja}</span></summary>
        <div className="mt-3"><BookingForm cabang={cabangKerja} minDate={t} /></div>
      </details>

      {pending.length > 0 && !pilih && (
        <section className="card mb-4 border-warn/40 bg-warn-soft/40">
          <h2 className="mb-2 text-[15px] font-extrabold">Menunggu konfirmasi DP <span className="pill-warn ml-1">{pending.length}</span></h2>
          <div className="grid gap-2.5 md:grid-cols-2">
            {pending.map((b) => (
              <div key={b.id}>
                <p className={`mb-1 text-xs font-bold ${b.tanggal_event && b.tanggal_event < t ? "text-bad" : "text-muted"}`}>{b.tanggal_event ? labelHari(b.tanggal_event) : "Tanpa tanggal"}{b.tanggal_event && b.tanggal_event < t ? " · sudah lewat" : ""}</p>
                <Kartu b={b} semuaCabang={!cabang} />
              </div>
            ))}
          </div>
        </section>
      )}

      {lewat.length > 0 && (
        <section className="card mb-4">
          <h2 className="text-[15px] font-extrabold">Sudah lewat, belum ditutup <span className="pill-warn ml-1">{lewat.length}</span></h2>
          <p className="sub mb-2 text-xs">Lunasi lalu tandai selesai — hasil fotonya otomatis masuk antrean Hasil Edit.</p>
          <div className="grid gap-2.5 md:grid-cols-2">
            {lewat.map((b) => (
              <div key={b.id}><p className="mb-1 text-xs font-bold text-muted">{labelHari(b.tanggal_event!)}</p><Kartu b={b} semuaCabang={!cabang} /></div>
            ))}
          </div>
        </section>
      )}

      {hari.map((d) => (
        <section key={d} className="mb-4">
          <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-muted">{labelHari(d)} <span className="font-semibold normal-case">· {agenda.filter((b) => b.tanggal_event === d).length} booking</span></h2>
          <div className="grid gap-2.5 md:grid-cols-2">
            {agenda.filter((b) => b.tanggal_event === d).map((b) => <Kartu key={b.id} b={b} semuaCabang={!cabang} />)}
          </div>
        </section>
      ))}
      {!hari.length && <p className="sub card py-8 text-center">{pilih ? "Tidak ada booking pada tanggal ini." : "Belum ada jadwal terkonfirmasi dalam 30 hari ke depan."}</p>}
    </>
  );
}
