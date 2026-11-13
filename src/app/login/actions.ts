"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { emailDari, type Res } from "@/lib/constants";
import { str } from "@/lib/format";

export async function login(_: Res, fd: FormData): Promise<Res> {
  const username = str(fd.get("username")).toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!username || !password) return { err: "Isi username dan kata sandi." };

  const sb = await createClient();
  const { data, error } = await sb.auth.signInWithPassword({ email: emailDari(username), password });
  if (error || !data.user) return { err: "Username atau kata sandi salah." };

  const { data: profile } = await sb.from("profiles").select("role,aktif").eq("id", data.user.id).maybeSingle();
  if (!profile?.aktif) {
    await sb.auth.signOut();
    return { err: "Akun ini dinonaktifkan. Hubungi pemilik." };
  }
  redirect(profile.role === "pemilik" ? "/" : "/kasir");
}
