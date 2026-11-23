-- =====================================================================
-- MS STUDIO — 003 NOTA / TANDA JADI
-- Tautan nota yang bisa dibuka customer tanpa login (tagihan DP, tanda jadi, bukti lunas).
-- Aman dijalankan berulang. Hanya MENAMBAH kolom, fungsi, dan trigger.
-- Dashboard dan website booking yang sudah berjalan tidak terpengaruh.
-- =====================================================================

create sequence if not exists public.nota_seq;

alter table public.booking add column if not exists nota_token text;
alter table public.booking add column if not exists nota_no    text;
alter table public.event   add column if not exists nota_token text;
alter table public.event   add column if not exists nota_no    text;

alter table public.cabang add column if not exists no_wa        text not null default '';
alter table public.cabang add column if not exists nota_catatan text not null default '';

-- Token & nomor nota selalu dibuat oleh database saat baris dibuat (termasuk dari website),
-- dan tidak bisa ditentukan oleh pengirimnya.
create or replace function public._nota_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.nota_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  new.nota_no    := 'INV-' || lpad(nextval('public.nota_seq')::text, 5, '0');
  return new;
end $$;
revoke execute on function public._nota_default() from public, anon, authenticated;

drop trigger if exists trg_nota_booking on public.booking;
drop trigger if exists trg_nota_event   on public.event;
create trigger trg_nota_booking before insert on public.booking for each row execute function public._nota_default();
create trigger trg_nota_event   before insert on public.event   for each row execute function public._nota_default();

-- Isi untuk baris yang sudah ada
update public.booking
   set nota_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
       nota_no    = 'INV-' || lpad(nextval('public.nota_seq')::text, 5, '0')
 where nota_token is null;
update public.event
   set nota_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
       nota_no    = 'INV-' || lpad(nextval('public.nota_seq')::text, 5, '0')
 where nota_token is null;

create unique index if not exists uq_booking_nota_token on public.booking (nota_token);
create unique index if not exists uq_event_nota_token   on public.event   (nota_token);

-- =====================================================================
-- Data nota untuk halaman publik. Hanya mengembalikan yang perlu dilihat customer
-- (tanpa nomor HP, tanpa catatan internal). NULL bila token tidak dikenal.
-- Status dihitung dari uang yang benar-benar tercatat masuk.
-- =====================================================================
create or replace function public.get_nota(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  b public.booking;
  e public.event;
  c public.cabang;
  v_dibayar int;
  v_sisa    int;
  v_status  text;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;

  select * into b from booking where nota_token = p_token;
  if found then
    select * into c from cabang where nama = b.cabang;
    -- DP dari website baru dianggap masuk setelah kasir mengonfirmasi
    v_dibayar := case when b.dp_transaction_id is not null or b.status <> 'Pending' then coalesce(b.dp, 0) else 0 end
                 + coalesce(b.pelunasan, 0);
    v_sisa   := greatest(0, coalesce(b.total, 0) - v_dibayar);
    v_status := case when b.status = 'Batal' then 'batal'
                     when coalesce(b.total, 0) > 0 and v_dibayar >= b.total then 'lunas'
                     when v_dibayar > 0 then 'tanda_jadi'
                     else 'tagihan' end;
    return json_build_object(
      'tipe', 'booking', 'nomor', b.nota_no, 'status', v_status, 'terbit', b.created_at,
      'cabang', b.cabang, 'no_wa', coalesce(c.no_wa, ''), 'qris_image', coalesce(c.qris_image, ''), 'catatan_nota', coalesce(c.nota_catatan, ''),
      'customer', b.customer, 'layanan', b.layanan, 'paket', b.paket, 'tanggal', b.tanggal_event, 'jam', left(b.jam_event, 5), 'lokasi', null,
      'total', coalesce(b.total, 0), 'dibayar', v_dibayar, 'sisa', v_sisa,
      'dp_diminta', case when v_dibayar = 0 and coalesce(b.dp, 0) > 0 then b.dp else null end,
      'tanggal_bayar', b.tanggal_dp);
  end if;

  select * into e from event where nota_token = p_token;
  if found then
    select * into c from cabang where nama = e.cabang;
    v_dibayar := case when e.dp_paid_at is not null then coalesce(e.dp, 0) else 0 end;
    if e.pelunasan_paid_at is not null then
      v_dibayar := v_dibayar + greatest(0, coalesce(e.total, 0) - v_dibayar);
    end if;
    v_sisa   := greatest(0, coalesce(e.total, 0) - v_dibayar);
    v_status := case when e.status = 'Batal' then 'batal'
                     when coalesce(e.total, 0) > 0 and v_dibayar >= e.total then 'lunas'
                     when v_dibayar > 0 then 'tanda_jadi'
                     else 'tagihan' end;
    return json_build_object(
      'tipe', 'job', 'nomor', e.nota_no, 'status', v_status, 'terbit', e.created_at,
      'cabang', e.cabang, 'no_wa', coalesce(c.no_wa, ''), 'qris_image', coalesce(c.qris_image, ''), 'catatan_nota', coalesce(c.nota_catatan, ''),
      'customer', e.klien, 'layanan', 'Job Luar · ' || coalesce(e.jenis, ''), 'paket', e.paket, 'tanggal', e.tanggal, 'jam', e.jam, 'lokasi', e.lokasi,
      'total', coalesce(e.total, 0), 'dibayar', v_dibayar, 'sisa', v_sisa, 'dp_diminta', null,
      'tanggal_bayar', (e.dp_paid_at at time zone 'Asia/Jakarta')::date);
  end if;

  return null;
end $$;

revoke execute on function public.get_nota(text) from public, anon, authenticated;
grant  execute on function public.get_nota(text) to anon, authenticated;

notify pgrst, 'reload schema';
