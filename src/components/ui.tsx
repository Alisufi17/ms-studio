"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { Res } from "@/lib/constants";

type Action = (prev: Res, fd: FormData) => Promise<Res>;

/** Form yang memanggil server action, menampilkan pesan hasilnya, dan mengosongkan diri bila sukses. */
export function ActionForm({
  action, children, className, submit, submitClass = "btn-primary w-full", onDone,
}: {
  action: Action; children: React.ReactNode; className?: string; submit: string; submitClass?: string; onDone?: () => void;
}) {
  const [state, run, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      onDone?.();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form ref={ref} action={run} className={className}>
      {children}
      {state.err && <p className="rounded-lg bg-bad-soft px-3 py-2 text-xs font-medium text-bad">{state.err}</p>}
      {state.ok && <p className="rounded-lg bg-ok-soft px-3 py-2 text-xs font-medium text-ok">{state.ok}</p>}
      <button className={submitClass} disabled={pending}>{pending ? "Menyimpan…" : submit}</button>
    </form>
  );
}

/** Tombol satu-klik untuk server action (opsional dengan konfirmasi). */
export function ActionButton({
  action, children, className = "btn-ghost btn-sm", confirm,
}: {
  action: () => Promise<Res>; children: React.ReactNode; className?: string; confirm?: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setErr("");
          start(async () => {
            const r = await action();
            if (r.err) setErr(r.err);
          });
        }}
      >
        {pending ? "…" : children}
      </button>
      {err && <span className="basis-full text-xs font-medium text-bad">{err}</span>}
    </>
  );
}

/** Input rupiah dengan pemisah ribuan; nilai mentahnya dibersihkan di server. Ikut kosong saat form di-reset. */
export function MoneyInput({ name, defaultValue, placeholder = "0", required }: { name: string; defaultValue?: number; placeholder?: string; required?: boolean }) {
  return (
    <input
      key={defaultValue ?? 0}
      name={name} inputMode="numeric" className="input num" placeholder={placeholder} required={required}
      defaultValue={defaultValue ? defaultValue.toLocaleString("id-ID") : ""}
      onInput={(e) => {
        const raw = e.currentTarget.value.replace(/[^\d]/g, "");
        e.currentTarget.value = raw ? Number(raw).toLocaleString("id-ID") : "";
      }}
    />
  );
}
