-- =====================================================================
-- MS STUDIO — 001 FONDASI
-- Aman dijalankan kapan saja: hanya MENAMBAH (tabel, fungsi, index).
-- Dashboard lama tetap jalan setelah file ini dijalankan.
-- Jalankan di Supabase > SQL Editor.
-- =====================================================================

-- ---------- Cabang (menggantikan kode cabang & QRIS yang ditanam di kode) ----------
create table if not exists public.cabang (
  nama        text primary key,
  kode        text not null unique,
  qris_image  text not null default '',
  qris_note   text not null default '',
  urutan      int  not null default 1,
  aktif       boolean not null default true
);

insert into public.cabang (nama, kode, urutan) values
  ('Jatibarang', 'JTB', 1),
  ('Adiwerna',   'ADW', 2)
on conflict (nama) do nothing;

-- Salin gambar/catatan QRIS dari config lama (kalau ada)
do $$
begin
  if to_regclass('public.config') is not null then
    update public.cabang c
       set qris_image = coalesce(nullif(c.qris_image, ''), cfg.data -> 'qrisImage' ->> c.nama, ''),
           qris_note  = coalesce(nullif(c.qris_note, ''),  cfg.data -> 'qrisNote'  ->> c.nama, '')
      from public.config cfg
     where cfg.id = 'main';
  end if;
end $$;

-- ---------- Profil pengguna (login lewat Supabase Auth) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  nama       text not null,
  role       text not null default 'karyawan' check (role in ('pemilik', 'karyawan')),
  cabang     text references public.cabang (nama) on update cascade,
  aktif      boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Fungsi bantu hak akses ----------
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and aktif $$;

create or replace function public.app_name() returns text
language sql stable security definer set search_path = public as
$$ select nama from profiles where id = auth.uid() and aktif $$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select public.app_role() is not null $$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.app_role() = 'pemilik', false) $$;

create or replace function public.wib_today() returns date
language sql stable as
$$ select (now() at time zone 'Asia/Jakarta')::date $$;

-- ---------- Index untuk pencarian per tanggal + cabang ----------
create index if not exists idx_transaksi_tgl_cabang   on public.transaksi   (tanggal, cabang);
create index if not exists idx_pengeluaran_tgl_cabang on public.pengeluaran (tanggal, cabang);
create index if not exists idx_setoran_tgl_cabang     on public.setoran     (tanggal, cabang);
create index if not exists idx_booking_tgl_cabang     on public.booking     (tanggal_event, cabang);
create index if not exists idx_booking_status         on public.booking     (status);
create index if not exists idx_orders_status_cabang   on public.orders      (status, cabang);
create index if not exists idx_order_items_order      on public.order_items (order_id);

-- ---------- Nomor pesanan pendek & pasti unik ----------
create sequence if not exists public.order_no_seq;

-- =====================================================================
-- PESANAN (kasir & QR) — harga SELALU dihitung di database
-- p_items: [{"id": "<uuid katalog>", "qty": 1, "people": 3}, ...]
-- =====================================================================
create or replace function public._order_build(
  p_cabang text, p_customer text, p_phone text, p_metode text, p_notes text,
  p_items jsonb, p_source text, p_status text, p_by text
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_kode   text;
  v_order  public.orders;
  v_item   jsonb;
  v_cat    public.catalog_items;
  v_qty    int;
  v_people int;
  v_extra  int;
  v_unit   numeric;
  v_total  numeric := 0;
  v_conf   text;
begin
  select kode into v_kode from cabang where nama = p_cabang and aktif;
  if v_kode is null then raise exception 'Cabang tidak dikenal'; end if;
  if length(trim(coalesce(p_customer, ''))) < 2 then raise exception 'Nama customer wajib diisi'; end if;
  if p_metode not in ('Cash', 'QRIS', 'Transfer') then raise exception 'Metode pembayaran tidak valid'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang kosong';
  end if;
  if jsonb_array_length(p_items) > 30 then raise exception 'Terlalu banyak item'; end if;

  insert into orders (order_no, cabang, customer_name, customer_phone, source, payment_method,
                      subtotal, discount, total, status, notes, created_by, created_at, updated_at)
  values (v_kode || '-' || to_char(wib_today(), 'YYMMDD') || '-' || lpad((nextval('order_no_seq') % 100000)::text, 5, '0'),
          p_cabang, left(trim(p_customer), 80), left(trim(coalesce(p_phone, '')), 20), p_source, p_metode,
          0, 0, 0, p_status, left(trim(coalesce(p_notes, '')), 300), p_by, now(), now())
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_cat from catalog_items
     where id = (v_item ->> 'id')::uuid and cabang = p_cabang and active;
    if not found then raise exception 'Ada paket yang sudah tidak tersedia. Muat ulang halaman.'; end if;

    v_qty := coalesce((v_item ->> 'qty')::int, 1);
    if v_qty < 1 or v_qty > 50 then raise exception 'Jumlah item tidak valid'; end if;

    if coalesce(v_cat.included_people, 0) > 0 then
      v_people := greatest(1, coalesce((v_item ->> 'people')::int, v_cat.included_people));
      if coalesce(v_cat.max_people, 0) > 0 and v_people > greatest(v_cat.max_people, v_cat.included_people) then
        raise exception 'Jumlah orang melebihi batas paket %', v_cat.name;
      end if;
      v_extra := greatest(0, v_people - v_cat.included_people);
      v_conf  := v_people || ' orang' ||
                 case when v_extra > 0 and coalesce(v_cat.extra_person_price, 0) > 0
                      then ' · ' || v_extra || ' tambahan'
                      else '' end;
    else
      v_people := null; v_extra := 0; v_conf := null;
    end if;

    v_unit  := v_cat.price + v_extra * coalesce(v_cat.extra_person_price, 0);
    v_total := v_total + v_unit * v_qty;

    insert into order_items (order_id, catalog_item_id, item_name, category, price, qty, line_total, people_count, configuration)
    values (v_order.id, v_cat.id, v_cat.name, v_cat.category, v_unit, v_qty, v_unit * v_qty, v_people, v_conf);
  end loop;

  update orders set subtotal = v_total, total = v_total where id = v_order.id returning * into v_order;
  return v_order;
end $$;

-- Catat pembayaran pesanan ke buku kas (dipakai kasir & konfirmasi QR)
create or replace function public._order_pay(p_order public.orders, p_by text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_trx     uuid;
  v_layanan text;
  v_paket   text;
begin
  select oi.category into v_layanan
    from order_items oi left join catalog_items ci on ci.id = oi.catalog_item_id
   where oi.order_id = p_order.id
   order by (coalesce(ci.item_type, 'package') = 'addon'), oi.line_total desc
   limit 1;
  select string_agg(qty || '× ' || item_name, ', ' order by line_total desc) into v_paket
    from order_items where order_id = p_order.id;

  insert into transaksi (tanggal, cabang, karyawan, customer, layanan, paket, total, metode, order_id, payment_stage)
  values (wib_today(), p_order.cabang, p_by, p_order.customer_name, coalesce(v_layanan, 'Lainnya'),
          left(v_paket, 200), p_order.total::int, p_order.payment_method, p_order.id::text, 'Pembayaran POS')
  returning id into v_trx;

  update orders set status = 'Dibayar', paid_at = now(), verified_by = p_by,
                    transaction_id = v_trx::text, updated_at = now()
   where id = p_order.id;
  return v_trx;
end $$;

-- Kasir: buat pesanan + langsung lunas, satu transaksi database
create or replace function public.pos_checkout(
  p_cabang text, p_customer text, p_phone text, p_metode text, p_notes text, p_items jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  if not is_staff() then raise exception 'Tidak berhak'; end if;
  v_order := _order_build(p_cabang, p_customer, p_phone, p_metode, p_notes, p_items, 'kasir', 'Menunggu', app_name());
  perform _order_pay(v_order, app_name());
  return json_build_object('order_no', v_order.order_no, 'total', v_order.total);
end $$;

-- Customer (QR): buat pesanan, menunggu konfirmasi kasir
create or replace function public.create_public_order(
  p_cabang text, p_customer text, p_phone text, p_metode text, p_notes text, p_items jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  if p_metode not in ('Cash', 'QRIS') then raise exception 'Metode pembayaran tidak valid'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 9 then
    raise exception 'Nomor WhatsApp tidak valid';
  end if;
  -- rem sederhana terhadap spam: maksimal 15 pesanan menunggu per cabang
  if (select count(*) from orders where cabang = p_cabang and source = 'qr'
        and status in ('Menunggu', 'Menunggu Verifikasi')) >= 15 then
    raise exception 'Antrean pesanan penuh. Silakan pesan lewat kasir.';
  end if;
  v_order := _order_build(p_cabang, p_customer, p_phone, p_metode, p_notes, p_items, 'qr',
                          case when p_metode = 'QRIS' then 'Menunggu Verifikasi' else 'Menunggu' end,
                          'Customer QR');
  return json_build_object('order_no', v_order.order_no, 'total', v_order.total,
                           'status', v_order.status, 'payment_method', v_order.payment_method,
                           'customer_name', v_order.customer_name);
end $$;

-- Kasir: konfirmasi pembayaran pesanan QR (boleh ganti metode saat bayar)
create or replace function public.confirm_order(p_order_id uuid, p_metode text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  if not is_staff() then raise exception 'Tidak berhak'; end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if v_order.status not in ('Menunggu', 'Menunggu Verifikasi') then
    raise exception 'Pesanan ini sudah %', lower(v_order.status);
  end if;
  if p_metode is not null then
    if p_metode not in ('Cash', 'QRIS', 'Transfer') then raise exception 'Metode pembayaran tidak valid'; end if;
    v_order.payment_method := p_metode;
    update orders set payment_method = p_metode where id = p_order_id;
  end if;
  perform _order_pay(v_order, app_name());
end $$;

-- Batalkan pesanan. Yang sudah dibayar hanya boleh dibatalkan pemilik (uangnya ikut dihapus dari buku kas).
create or replace function public.cancel_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  if not is_staff() then raise exception 'Tidak berhak'; end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if v_order.status = 'Batal' then return; end if;
  if v_order.status = 'Dibayar' then
    if not is_owner() then raise exception 'Pesanan yang sudah dibayar hanya bisa dibatalkan pemilik'; end if;
    delete from transaksi where order_id = v_order.id::text;
  end if;
  update orders set status = 'Batal', cancelled_at = now(), verified_by = app_name(),
                    transaction_id = null, updated_at = now()
   where id = p_order_id;
end $$;

-- =====================================================================
-- BOOKING — pembayaran DP / pelunasan langsung masuk buku kas
-- =====================================================================
create or replace function public.booking_pay(
  p_booking_id uuid, p_stage text, p_jumlah int, p_metode text, p_cabang text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_b   public.booking;
  v_trx uuid;
begin
  if not is_staff() then raise exception 'Tidak berhak'; end if;
  if p_stage not in ('DP', 'Pelunasan') then raise exception 'Tahap pembayaran tidak valid'; end if;
  if p_metode not in ('Cash', 'QRIS', 'Transfer') then raise exception 'Metode pembayaran tidak valid'; end if;
  if coalesce(p_jumlah, 0) < 0 then raise exception 'Nominal tidak valid'; end if;

  select * into v_b from booking where id = p_booking_id for update;
  if not found then raise exception 'Booking tidak ditemukan'; end if;
  if v_b.status in ('Batal', 'Selesai') then raise exception 'Booking ini sudah %', lower(v_b.status); end if;
  if p_stage = 'DP' and v_b.dp_transaction_id is not null then raise exception 'DP booking ini sudah dicatat'; end if;
  if p_stage = 'Pelunasan' and v_b.pelunasan_transaction_id is not null then raise exception 'Pelunasan sudah dicatat'; end if;

  if p_jumlah > 0 then
    insert into transaksi (tanggal, cabang, karyawan, customer, layanan, paket, total, metode, booking_id, payment_stage)
    values (wib_today(), coalesce(p_cabang, v_b.cabang), app_name(), v_b.customer, coalesce(v_b.layanan, 'Lainnya'),
            coalesce(v_b.paket, v_b.layanan), p_jumlah, p_metode, v_b.id::text,
            case when p_stage = 'DP' then 'DP Booking' else 'Pelunasan' end)
    returning id into v_trx;
  end if;

  if p_stage = 'DP' then
    update booking
       set dp = p_jumlah, metode_dp = p_metode, tanggal_dp = wib_today(), dp_transaction_id = v_trx::text,
           status = case when p_jumlah >= coalesce(total, 0) and coalesce(total, 0) > 0 then 'Lunas' else 'Aktif' end,
           tanggal_lunas = case when p_jumlah >= coalesce(total, 0) and coalesce(total, 0) > 0 then wib_today() else tanggal_lunas end,
           updated_at = now()
     where id = p_booking_id;
  else
    update booking
       set pelunasan = p_jumlah, metode_pelunasan = p_metode, tanggal_lunas = wib_today(),
           pelunasan_transaction_id = v_trx::text, status = 'Lunas', updated_at = now()
     where id = p_booking_id;
  end if;
end $$;

-- Slot yang sudah terisi (dipakai form booking)
create or replace function public.booked_slots(p_cabang text, p_tanggal date, p_ruang text)
returns setof text
language sql stable security definer set search_path = public as $$
  select left(jam_event, 5) from booking
   where cabang = p_cabang and tanggal_event = p_tanggal and ruang = p_ruang
     and status in ('Aktif', 'Lunas') and jam_event is not null
$$;

-- =====================================================================
-- RINGKASAN — dihitung di database, bukan mengunduh semua baris
-- =====================================================================
create or replace function public.ringkasan(p_from date, p_to date, p_cabang text default null)
returns json
language plpgsql stable security definer set search_path = public as $$
declare v json;
begin
  if not is_staff() then raise exception 'Tidak berhak'; end if;
  with t as (
    select * from transaksi
     where tanggal between p_from and p_to and (p_cabang is null or cabang = p_cabang)
  ), p as (
    select * from pengeluaran
     where tanggal between p_from and p_to and (p_cabang is null or cabang = p_cabang)
       and dibatalkan_at is null
  ), s as (
    select * from setoran
     where coalesce(tanggal_omset, tanggal) between p_from and p_to and (p_cabang is null or cabang = p_cabang)
  )
  select json_build_object(
    'omzet',        (select coalesce(sum(total), 0) from t),
    'jumlah_trx',   (select count(*) from t),
    'cash',         (select coalesce(sum(total), 0) from t where metode = 'Cash'),
    'non_cash',     (select coalesce(sum(total), 0) from t where metode <> 'Cash'),
    'pengeluaran',  (select coalesce(sum(jumlah), 0) from p),
    'keluar_cash',  (select coalesce(sum(jumlah), 0) from p where metode = 'Cash'),
    'setoran',      (select coalesce(sum(jumlah), 0) from s),
    'per_metode',   (select coalesce(json_agg(x), '[]') from (
                       select metode as label, sum(total) as nilai, count(*) as jumlah from t group by 1 order by 2 desc) x),
    'per_layanan',  (select coalesce(json_agg(x), '[]') from (
                       select case when layanan in ('Self Photo', 'Selfphoto') then 'Self Photo'
                                   when layanan in ('Graduation', 'Foto Wisuda') then 'Foto Wisuda'
                                   when layanan = 'POS' then 'Kasir (lama)'
                                   else coalesce(layanan, 'Lainnya') end as label,
                              sum(total) as nilai, count(*) as jumlah
                         from t group by 1 order by 2 desc) x),
    'per_cabang',   (select coalesce(json_agg(x), '[]') from (
                       select cabang as label, sum(total) as nilai, count(*) as jumlah from t group by 1 order by 2 desc) x),
    'per_karyawan', (select coalesce(json_agg(x), '[]') from (
                       select coalesce(karyawan, '—') as label, sum(total) as nilai, count(*) as jumlah from t group by 1 order by 2 desc) x),
    'per_hari',     (select coalesce(json_agg(x order by x.tanggal), '[]') from (
                       select d::date as tanggal,
                              (select coalesce(sum(total), 0) from t where t.tanggal = d::date) as masuk,
                              (select coalesce(sum(jumlah), 0) from p where p.tanggal = d::date) as keluar
                         from generate_series(p_from, p_to, interval '1 day') d) x)
  ) into v;
  return v;
end $$;

-- Posisi kas laci per cabang (semua waktu): cash masuk − cash keluar − setoran
create or replace function public.posisi_kas() returns json
language plpgsql stable security definer set search_path = public as $$
declare v json;
begin
  if not is_staff() then raise exception 'Tidak berhak'; end if;
  select coalesce(json_agg(x order by x.urutan), '[]') into v from (
    select c.nama as cabang, c.urutan,
           (select coalesce(sum(total), 0)  from transaksi   where cabang = c.nama and metode = 'Cash')
         - (select coalesce(sum(jumlah), 0) from pengeluaran where cabang = c.nama and metode = 'Cash' and dibatalkan_at is null)
         - (select coalesce(sum(jumlah), 0) from setoran     where cabang = c.nama) as kas
      from cabang c where c.aktif
  ) x;
  return v;
end $$;

-- ---------- Hak eksekusi fungsi (hanya fungsi milik file ini; fungsi lama tidak disentuh) ----------
do $$
declare f text;
begin
  foreach f in array array[
    '_order_build(text, text, text, text, text, jsonb, text, text, text)',
    '_order_pay(public.orders, text)',
    'app_role()', 'app_name()', 'is_staff()', 'is_owner()', 'wib_today()',
    'pos_checkout(text, text, text, text, text, jsonb)',
    'create_public_order(text, text, text, text, text, jsonb)',
    'confirm_order(uuid, text)', 'cancel_order(uuid)',
    'booking_pay(uuid, text, int, text, text)',
    'booked_slots(text, date, text)',
    'ringkasan(date, date, text)', 'posisi_kas()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    -- fungsi berawalan _ bersifat internal: tidak boleh dipanggil langsung dari luar
    if left(f, 1) <> '_' then
      execute format('grant execute on function public.%s to authenticated', f);
    end if;
  end loop;
  grant execute on function public.create_public_order(text, text, text, text, text, jsonb) to anon;
  grant execute on function public.booked_slots(text, date, text) to anon;
  grant execute on function public.is_staff(), public.is_owner(), public.app_role(), public.wib_today() to anon;
end $$;

grant select on public.cabang to anon, authenticated;
grant select on public.profiles to authenticated;

-- Pesanan baru muncul langsung di kasir (realtime)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- Tabel baru langsung dikunci (tidak memengaruhi dashboard lama)
alter table public.cabang   enable row level security;
alter table public.profiles enable row level security;
revoke all on public.cabang, public.profiles from anon, authenticated;
grant select on public.cabang to anon, authenticated;
grant insert, update, delete on public.cabang to authenticated;
grant select on public.profiles to authenticated;
drop policy if exists cab_public on public.cabang;
drop policy if exists cab_write on public.cabang;
drop policy if exists prof_select on public.profiles;
create policy cab_public on public.cabang for select to anon, authenticated using (true);
create policy cab_write  on public.cabang for all to authenticated using (is_owner()) with check (is_owner());
create policy prof_select on public.profiles for select to authenticated using (is_staff() or id = auth.uid());

-- =====================================================================
-- JOB LUAR — pakai tabel event yang sudah ada, pembayaran masuk buku kas
-- =====================================================================
alter table public.event add column if not exists no_hp text;
alter table public.event add column if not exists jam   text;
create index if not exists idx_event_tanggal on public.event (tanggal);

create or replace function public.event_pay(
  p_event_id uuid, p_stage text, p_jumlah int, p_metode text, p_cabang text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_e public.event;
begin
  if not is_staff() then raise exception 'Tidak berhak'; end if;
  if p_stage not in ('DP', 'Pelunasan') then raise exception 'Tahap pembayaran tidak valid'; end if;
  if p_metode not in ('Cash', 'QRIS', 'Transfer') then raise exception 'Metode pembayaran tidak valid'; end if;
  if coalesce(p_jumlah, 0) <= 0 then raise exception 'Isi nominal pembayaran'; end if;
  select * into v_e from event where id = p_event_id for update;
  if not found then raise exception 'Job tidak ditemukan'; end if;
  if v_e.status = 'Batal' then raise exception 'Job ini sudah dibatalkan'; end if;
  if p_stage = 'DP' and v_e.dp_paid_at is not null then raise exception 'DP job ini sudah dicatat'; end if;
  if p_stage = 'Pelunasan' and v_e.pelunasan_paid_at is not null then raise exception 'Pelunasan sudah dicatat'; end if;

  insert into transaksi (tanggal, cabang, karyawan, customer, layanan, paket, total, metode, payment_stage)
  values (wib_today(), coalesce(v_e.cabang, p_cabang), app_name(), v_e.klien, 'Job Luar',
          coalesce(nullif(v_e.paket, ''), v_e.jenis), p_jumlah, p_metode,
          case when p_stage = 'DP' then 'DP Job Luar' else 'Pelunasan Job Luar' end);

  if p_stage = 'DP' then
    update event set dp = p_jumlah, dp_paid_at = now(), dp_method = p_metode where id = p_event_id;
  else
    update event set pelunasan_paid_at = now(), pelunasan_method = p_metode where id = p_event_id;
  end if;
end $$;

-- =====================================================================
-- HASIL EDIT — antrean kirim hasil foto, dengan tenggat & penanggung jawab
-- =====================================================================
create table if not exists public.hasil_edit (
  id            uuid primary key default gen_random_uuid(),
  customer      text not null,
  no_hp         text,
  layanan       text,
  cabang        text,
  tanggal_foto  date not null,
  tenggat       date not null,
  pic           text,
  status        text not null default 'Proses' check (status in ('Proses', 'Terkirim')),
  terkirim_at   timestamptz,
  terkirim_oleh text,
  catatan       text,
  booking_id    text,
  event_id      text,
  order_id      text,
  created_at    timestamptz not null default now()
);
create unique index if not exists uq_hasil_booking on public.hasil_edit (booking_id) where booking_id is not null;
create unique index if not exists uq_hasil_event   on public.hasil_edit (event_id)   where event_id is not null;
create unique index if not exists uq_hasil_order   on public.hasil_edit (order_id)   where order_id is not null;
create index if not exists idx_hasil_status_tenggat on public.hasil_edit (status, tenggat);

alter table public.hasil_edit enable row level security;
revoke all on public.hasil_edit from anon, authenticated;
grant select, insert, update, delete on public.hasil_edit to authenticated;
drop policy if exists hasil_select on public.hasil_edit;
drop policy if exists hasil_insert on public.hasil_edit;
drop policy if exists hasil_update on public.hasil_edit;
drop policy if exists hasil_delete on public.hasil_edit;
create policy hasil_select on public.hasil_edit for select to authenticated using (is_staff());
create policy hasil_insert on public.hasil_edit for insert to authenticated with check (is_staff());
create policy hasil_update on public.hasil_edit for update to authenticated using (is_staff()) with check (is_staff());
create policy hasil_delete on public.hasil_edit for delete to authenticated using (is_owner());

-- Berapa hari batas kirim hasil per layanan. NULL = tidak perlu antrean (file langsung jadi).
create or replace function public.edit_hari(p_layanan text) returns int
language sql immutable as $$
  select case
    when p_layanan ~* 'job luar|event|wedding|dokumentasi' then 7
    when p_layanan ~* 'pas ?foto'                           then 1
    when p_layanan ~* 'keluarga|wisuda|graduation|single|photoshoot|cetak|bingkai' then 3
    else null
  end
$$;

-- Otomatis masuk antrean saat: booking ditandai Selesai, job luar Selesai, pesanan kasir Dibayar.
-- Kesalahan di sini tidak boleh menggagalkan transaksi utamanya.
create or replace function public._hasil_auto() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_layanan text;
  v_hari    int;
begin
  begin
    if tg_table_name = 'booking' then
      if new.status = 'Selesai' and old.status is distinct from 'Selesai' then
        v_hari := edit_hari(coalesce(new.layanan, ''));
        -- booking lama yang baru dirapikan statusnya tidak ikut masuk antrean
        if v_hari is not null and coalesce(new.tanggal_event, wib_today()) >= wib_today() - 14 then
          insert into hasil_edit (customer, no_hp, layanan, cabang, tanggal_foto, tenggat, pic, booking_id)
          values (new.customer, new.no_hp, new.layanan, new.cabang, coalesce(new.tanggal_event, wib_today()),
                  coalesce(new.tanggal_event, wib_today()) + v_hari, app_name(), new.id::text)
          on conflict do nothing;
        end if;
      end if;
    elsif tg_table_name = 'event' then
      if new.status = 'Selesai' and old.status is distinct from 'Selesai' then
        insert into hasil_edit (customer, no_hp, layanan, cabang, tanggal_foto, tenggat, pic, event_id)
        values (new.klien, new.no_hp, 'Job Luar · ' || coalesce(new.jenis, ''), new.cabang, coalesce(new.tanggal, wib_today()),
                coalesce(new.tanggal, wib_today()) + 7, app_name(), new.id::text)
        on conflict do nothing;
      end if;
    elsif tg_table_name = 'orders' then
      if new.status = 'Dibayar' and old.status is distinct from 'Dibayar' then
        select oi.category into v_layanan
          from order_items oi
         where oi.order_id = new.id and edit_hari(oi.category) is not null
         order by oi.line_total desc limit 1;
        if v_layanan is not null then
          insert into hasil_edit (customer, no_hp, layanan, cabang, tanggal_foto, tenggat, pic, order_id)
          values (new.customer_name, new.customer_phone, v_layanan, new.cabang, wib_today(),
                  wib_today() + edit_hari(v_layanan), new.verified_by, new.id::text)
          on conflict do nothing;
        end if;
      end if;
    end if;
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists trg_hasil_booking on public.booking;
drop trigger if exists trg_hasil_event   on public.event;
drop trigger if exists trg_hasil_orders  on public.orders;
create trigger trg_hasil_booking after update of status on public.booking for each row execute function public._hasil_auto();
create trigger trg_hasil_event   after update of status on public.event   for each row execute function public._hasil_auto();
create trigger trg_hasil_orders  after update of status on public.orders  for each row execute function public._hasil_auto();

revoke execute on function public.event_pay(uuid, text, int, text, text) from public, anon;
revoke execute on function public._hasil_auto() from public, anon, authenticated;
grant execute on function public.event_pay(uuid, text, int, text, text) to authenticated;

notify pgrst, 'reload schema';
