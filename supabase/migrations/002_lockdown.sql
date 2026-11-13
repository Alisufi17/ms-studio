-- =====================================================================
-- MS STUDIO — 002 KUNCI AKSES (RLS)
-- JALANKAN SAAT PINDAH ke dashboard baru. Setelah ini:
--   • dashboard LAMA berhenti berfungsi (memang tujuannya),
--   • website booking lama TETAP jalan (boleh cek slot & kirim booking Pending),
--   • data hanya bisa dibaca/diubah oleh akun yang login.
-- =====================================================================

-- 1) Bersihkan semua policy & hak lama di tabel aplikasi
do $$
declare
  t text;
  pol record;
  tabs text[] := array['transaksi','pengeluaran','booking','setoran','event','sop_check','sop_fase','notes',
                       'users','alokasi','config','leads','catalog_items','orders','order_items','cabang','profiles','hasil_edit'];
begin
  foreach t in array tabs loop
    if to_regclass('public.' || t) is null then continue; end if;
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- 2) Hak tabel untuk pengguna yang login (baris tetap disaring policy di bawah)
grant select, insert, update, delete on
  public.transaksi, public.pengeluaran, public.booking, public.setoran, public.catalog_items, public.cabang,
  public.event, public.hasil_edit
  to authenticated;
grant select on public.orders, public.order_items, public.profiles to authenticated;
grant delete on public.orders, public.order_items to authenticated;

-- 3) Policy
-- Buku kas: karyawan boleh lihat & tambah; ubah/hapus hanya pemilik
create policy trx_select on public.transaksi for select to authenticated using (is_staff());
create policy trx_insert on public.transaksi for insert to authenticated with check (is_staff());
create policy trx_update on public.transaksi for update to authenticated using (is_owner()) with check (is_owner());
create policy trx_delete on public.transaksi for delete to authenticated using (is_owner());

create policy keluar_select on public.pengeluaran for select to authenticated using (is_staff());
create policy keluar_insert on public.pengeluaran for insert to authenticated with check (is_staff());
create policy keluar_update on public.pengeluaran for update to authenticated using (is_owner()) with check (is_owner());
create policy keluar_delete on public.pengeluaran for delete to authenticated using (is_owner());

create policy setor_select on public.setoran for select to authenticated using (is_staff());
create policy setor_insert on public.setoran for insert to authenticated with check (is_staff());
create policy setor_update on public.setoran for update to authenticated using (is_owner()) with check (is_owner());
create policy setor_delete on public.setoran for delete to authenticated using (is_owner());

-- Booking: karyawan kelola penuh, hapus hanya pemilik
create policy bk_select on public.booking for select to authenticated using (is_staff());
create policy bk_insert on public.booking for insert to authenticated with check (is_staff());
create policy bk_update on public.booking for update to authenticated using (is_staff()) with check (is_staff());
create policy bk_delete on public.booking for delete to authenticated using (is_owner());

-- Website publik: hanya boleh melihat JAM yang terisi (tanpa nama/nomor HP) & mengirim booking Pending
grant select (tanggal_event, jam_event, cabang, ruang, layanan, status) on public.booking to anon;
grant insert on public.booking to anon;
create policy bk_public_slots on public.booking for select to anon using (status in ('Aktif', 'Lunas'));
create policy bk_public_insert on public.booking for insert to anon
  with check (status = 'Pending' and source = 'website'
              and dp_transaction_id is null and pelunasan_transaction_id is null
              and coalesce(pelunasan, 0) = 0);

-- Pesanan: dibaca karyawan; dibuat/diubah hanya lewat fungsi database; hapus hanya pemilik
create policy ord_select on public.orders for select to authenticated using (is_staff());
create policy ord_delete on public.orders for delete to authenticated using (is_owner());
create policy oi_select on public.order_items for select to authenticated using (is_staff());
create policy oi_delete on public.order_items for delete to authenticated using (is_owner());

-- Katalog & cabang: publik hanya melihat yang aktif; kelola hanya pemilik
grant select on public.catalog_items, public.cabang to anon;
create policy cat_public on public.catalog_items for select to anon using (active);
create policy cat_select on public.catalog_items for select to authenticated using (active or is_staff());
create policy cat_write  on public.catalog_items for all to authenticated using (is_owner()) with check (is_owner());
create policy cab_public on public.cabang for select to anon, authenticated using (true);
create policy cab_write  on public.cabang for all to authenticated using (is_owner()) with check (is_owner());

-- Profil: sesama karyawan boleh melihat nama; kelola akun lewat server (service role)
create policy prof_select on public.profiles for select to authenticated using (is_staff() or id = auth.uid());

-- Job luar & antrean hasil edit: admin kelola, hapus hanya pemilik
create policy ev_select on public.event for select to authenticated using (is_staff());
create policy ev_insert on public.event for insert to authenticated with check (is_staff());
create policy ev_update on public.event for update to authenticated using (is_staff()) with check (is_staff());
create policy ev_delete on public.event for delete to authenticated using (is_owner());
create policy hasil_select on public.hasil_edit for select to authenticated using (is_staff());
create policy hasil_insert on public.hasil_edit for insert to authenticated with check (is_staff());
create policy hasil_update on public.hasil_edit for update to authenticated using (is_staff()) with check (is_staff());
create policy hasil_delete on public.hasil_edit for delete to authenticated using (is_owner());

-- Tabel lama yang tidak dipakai dashboard baru (config, alokasi, notes, sop_*, users):
-- RLS aktif tanpa policy = tertutup total dari luar. Datanya tetap aman tersimpan.

-- 4) Matikan login lama (sandi polos)
do $$
declare fn record;
begin
  for fn in select p.oid::regprocedure as sig from pg_proc p
             where p.pronamespace = 'public'::regnamespace and p.proname in ('verify_login') loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
