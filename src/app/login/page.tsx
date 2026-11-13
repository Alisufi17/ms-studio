import { ActionForm } from "@/components/ui";
import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <div className="card w-full max-w-sm p-7">
        <div className="mx-auto mb-3 grid size-14 place-items-center rounded-lg bg-rose text-2xl font-medium text-white">M</div>
        <h1 className="h1 text-center">MS Studio</h1>
        <p className="sub mb-5 text-center">Masuk untuk mulai kerja</p>
        {err === "nonaktif" && <p className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-xs font-medium text-bad">Akun tidak aktif atau belum punya profil.</p>}
        <ActionForm action={login} submit="Masuk" className="space-y-3">
          <div>
            <label className="label" htmlFor="username">Username</label>
            <input id="username" name="username" className="input" autoCapitalize="none" autoComplete="username" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Kata sandi</label>
            <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
          </div>
        </ActionForm>
        <p className="sub mt-4 text-center text-xs">Lupa sandi? Minta pemilik mengatur ulang di menu Akun.</p>
      </div>
    </main>
  );
}
