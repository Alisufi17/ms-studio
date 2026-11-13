import { createAdminClient } from "@/lib/supabase/admin";
import { getPengingat, labelH, selisihHari } from "@/lib/pengingat";

export const dynamic = "force-dynamic";

/**
 * Dipanggil Vercel Cron tiap pagi (lihat vercel.json). Mengirim rangkuman pengingat ke grup Telegram
 * bila TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID diisi. Tanpa keduanya, hanya mengembalikan rangkumannya.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  const { jobs, telat, segera } = await getPengingat(createAdminClient());
  const baris: string[] = [];
  if (telat.length) baris.push(`🔴 ${telat.length} HASIL EDIT TELAT`, ...telat.map((x) => `• ${x.customer} — ${x.layanan ?? ""} (${labelH(selisihHari(x.tenggat))}) · PJ ${x.pic ?? "belum ada"}`), "");
  if (segera.length) baris.push(`🟡 ${segera.length} hasil edit jatuh tempo`, ...segera.map((x) => `• ${x.customer} — ${x.layanan ?? ""} (${labelH(selisihHari(x.tenggat))}) · PJ ${x.pic ?? "belum ada"}`), "");
  if (jobs.length) baris.push("🎥 JOB LUAR — siapkan alat, tim & transport", ...jobs.map((j) => `• ${labelH(selisihHari(j.tanggal))}: ${j.klien} — ${j.jenis ?? ""}${j.jam ? " " + j.jam : ""}${j.lokasi ? " @ " + j.lokasi : ""}`));
  const text = baris.join("\n").trim();

  let terkirim = false;
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (text && token && chat) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: "Pengingat MS Studio\n\n" + text }),
    });
    terkirim = r.ok;
  }
  return Response.json({ telat: telat.length, segera: segera.length, job: jobs.length, terkirim, text });
}
