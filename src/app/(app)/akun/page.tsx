import { requireOwner } from "@/lib/session";
import { ActionForm } from "@/components/ui";
import { buatAkun, ubahAkun } from "../actions";

type P = { id: string; username: string; nama: string; role: string; cabang: string | null; aktif: boolean };

export default async function AkunPage() {
  const { sb, cabangList, profile } = await requireOwner();
  const { data } = await sb.from("profiles").select("id,username,nama,role,cabang,aktif").order("role", { ascending: false }).order("nama");
  const Cabang = ({ value }: { value?: string | null }) => (
    <select name="cabang" defaultValue={value ?? ""} className="input"><option value="">Tidak tetap</option>{cabangList.map((c) => <option key={c.nama}>{c.nama}</option>)}</select>
  );
  return (
    <>
      <div className="mb-4"><h1 className="h1">Akun</h1><p className="sub">Siapa saja yang boleh masuk. Kata sandi disimpan terenkripsi — tidak bisa dilihat, hanya bisa diganti.</p></div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="card">
          <div className="divide-y divide-line">
            {((data ?? []) as P[]).map((u) => (
              <details key={u.id} className={u.aktif ? "" : "opacity-55"}>
                <summary className="flex items-center gap-3 py-2.5 text-[13px]">
                  <span className="flex-1"><b>{u.nama}</b>{u.id === profile.id && <span className="text-muted"> (kamu)</span>}<span className="block text-[11px] text-muted">@{u.username} · {u.cabang ?? "cabang tidak tetap"}</span></span>
                  <span className={u.role === "pemilik" ? "pill-ok" : "pill-mute"}>{u.role === "pemilik" ? "pemilik" : "admin"}</span>
                  {!u.aktif && <span className="pill-bad">nonaktif</span>}
                  <span className="btn-ghost btn-sm">Ubah</span>
                </summary>
                <ActionForm action={ubahAkun} submit="Simpan" className="grid gap-2 pb-4 sm:grid-cols-2" submitClass="btn-primary sm:col-span-2">
                  <input type="hidden" name="rid" value={u.id} />
                  <div><label className="label">Nama</label><input name="nama" defaultValue={u.nama} className="input" required /></div>
                  <div><label className="label">Kata sandi baru (kosongkan bila tetap)</label><input name="password" type="password" autoComplete="new-password" minLength={8} className="input" /></div>
                  <div><label className="label">Peran</label><select name="role" defaultValue={u.role} className="input"><option value="karyawan">Admin</option><option value="pemilik">Pemilik</option></select></div>
                  <div><label className="label">Cabang utama</label><Cabang value={u.cabang} /></div>
                  <label className="flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" name="aktif" defaultChecked={u.aktif} /> Akun aktif (boleh login)</label>
                </ActionForm>
              </details>
            ))}
          </div>
        </section>
        <section className="card self-start">
          <h2 className="mb-2 text-[15px] font-extrabold">＋ Akun baru</h2>
          <ActionForm action={buatAkun} submit="Buat akun" className="space-y-2">
            <div><label className="label">Nama</label><input name="nama" className="input" required /></div>
            <div><label className="label">Username (huruf kecil, tanpa spasi)</label><input name="username" autoCapitalize="none" className="input" required /></div>
            <div><label className="label">Kata sandi (min. 8 karakter)</label><input name="password" type="password" autoComplete="new-password" minLength={8} className="input" required /></div>
            <div><label className="label">Peran</label><select name="role" className="input"><option value="karyawan">Admin</option><option value="pemilik">Pemilik</option></select></div>
            <div><label className="label">Cabang utama</label><Cabang /></div>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
