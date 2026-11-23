import "server-only";
import { headers } from "next/headers";

/** Alamat situs yang sedang dipakai (untuk membuat tautan nota yang bisa dibuka customer). */
export async function getOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
