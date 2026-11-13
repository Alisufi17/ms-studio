export const TZ = "Asia/Jakarta";

export const rp = (n: number | string | null | undefined) =>
  "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");

export const rpShort = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",") + "jt" : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(n);

/** Tanggal hari ini (YYYY-MM-DD) menurut WIB, di mana pun server berjalan. */
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

export function addDays(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const monthStart = (date: string) => date.slice(0, 8) + "01";

export const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const tgl = (date: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  new Date(date + "T00:00:00Z").toLocaleDateString("id-ID", { ...opts, timeZone: "UTC" });

export const jam = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

export const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;
export const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
