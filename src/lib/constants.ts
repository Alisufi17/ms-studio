export const METODE = ["Cash", "QRIS", "Transfer"] as const;
export const LAYANAN = ["Self Photo", "Photobox", "Foto Keluarga", "Foto Wisuda", "Pas Foto", "Lainnya"] as const;
export const KATEGORI_KELUAR = ["Kertas", "Tinta", "Listrik", "Perlengkapan", "Snack/Minum", "Gaji", "Belanja Besar", "Lainnya"] as const;

/** Ruang yang dipakai sebuah layanan — menentukan slot mana yang bentrok. */
export const ruangDari = (layanan: string) =>
  /self/i.test(layanan) ? "Selfphoto" : /photobox/i.test(layanan) ? "Photobox" : "Studio";

export const SLOTS = Array.from({ length: 20 }, (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

export const AUTH_DOMAIN = process.env.AUTH_EMAIL_DOMAIN || "msstudio.local";
export const emailDari = (username: string) => `${username.toLowerCase()}@${AUTH_DOMAIN}`;

export type Res = { ok?: string; err?: string };
