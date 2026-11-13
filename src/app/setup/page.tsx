import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailDari, type Res } from "@/lib/constants";
import { str } from "@/lib/format";
import { ActionForm } from "@/components/ui";

export const dynamic = "force-dynamic";

async function sudahAdaPemilik() {
  const { count, error } = await createAdminClient().from("profiles").select("id", { count: "exact", head: true });
  if (error) throw new Error("Tabel profiles belum ada. Jalankan supabase/migrations/001_foundation.sql dulu.");
  return (count ?? 0) > 0;
}

/** Hanya berfungsi selama belum ada satu pun akun — untuk membuat akun pemilik pertama. */
async function buatPemilik(_: Res, fd: FormData): Promise<Res> {
  "use server";
  if (await sudahAdaPemilik()) return { err: "Penyiapan sudah selesai. Silakan login." };
  const nama = str(fd.get("nama")), username = str(fd.get("username")).toLowerCase(), password = String(fd.get("password") ?? "");
  if (!nama || !/^[a-z0-9._-]{3,30}$/.test(username)) return { err: "Username 3–30 karakter: huruf kecil, angka, titik, strip." };
  if (password.length < 8) return { err: "Kata sandi minimal 8 karakter." };
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email: emailDari(username), password, email_confirm: true });
  if (error || !data.user) return { err: "Gagal membuat akun: " + (error?.message ?? "") };
  const { error: e2 } = await admin.from("profiles").insert({ id: data.user.id, username, nama, role: "pemilik" });
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { err: "Gagal menyimpan profil: " + e2.message };
  }
  redirect("/login");
}

export default async function SetupPage() {
  if (await sudahAdaPemilik()) redirect("/login");
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <div className="card w-full max-w-sm p-7">
        <h1 className="h1">Penyiapan pertama</h1>
        <p className="sub mb-5">Buat akun pemilik. Halaman ini otomatis tertutup setelah akun pertama dibuat.</p>
        <ActionForm action={buatPemilik} submit="Buat akun pemilik" className="space-y-3">
          <div><label className="label">Nama</label><input name="nama" className="input" required /></div>
          <div><label className="label">Username</label><input name="username" className="input" autoCapitalize="none" required /></div>
          <div><label className="label">Kata sandi (min. 8 karakter)</label><input name="password" type="password" className="input" required minLength={8} /></div>
        </ActionForm>
      </div>
    </main>
  );
}
