# MS Studio — Kasir, Booking & Buku Kas

Pengganti `dashboard.html`. Next.js (App Router) + Supabase (Auth, Postgres, RLS), di-deploy ke Vercel.

## Menu

| Menu | Untuk | Isi |
|---|---|---|
| Ringkasan | Pemilik | Omzet per periode/cabang/layanan/metode/karyawan, omzet harian, kas di laci |
| Kasir | Semua | Katalog + keranjang, pesanan QR masuk (realtime), pesanan lunas hari ini |
| Booking | Semua | Konfirmasi DP, agenda 30 hari, booking manual dengan cek jam bentrok, pelunasan |
| Job Luar | Semua | Acara luar studio, DP/pelunasan masuk Buku Kas, pengingat mulai **H-4** |
| Hasil Edit | Semua | Antrean kirim hasil foto dengan batas kirim & penanggung jawab; telat = merah |
| Buku Kas | Semua | Semua uang masuk/keluar/setoran, disaring **tanggal + cabang + metode + nama**; pemilik bisa **export Excel** |
| Katalog | Pemilik | Paket & harga per cabang, QR pesan mandiri, gambar QRIS |
| Akun | Pemilik | Buat akun, ganti sandi, nonaktifkan |
| `/pesan/jtb`, `/pesan/adw` | Customer | Pesan mandiri lewat QR, tanpa login |

## Pasang (sekali saja)

1. **Supabase › SQL Editor** — jalankan `supabase/migrations/001_foundation.sql`.
   Aman: hanya menambah tabel/fungsi. Dashboard lama tetap jalan.
   Lalu jalankan juga `003_nota.sql` (nota & tanda jadi, lihat bagian di bawah).
2. **Vercel** — impor repo ini, isi Environment Variables seperti `.env.example`
   (URL, anon key, dan *service role key* proyek `ivodkdvhlkwevfkkzujs`). Deploy.
3. Buka `https://<domain>/setup` → buat akun pemilik. Halaman ini tertutup sendiri setelah akun pertama ada.
4. Login → menu **Akun** → buat akun admin **Hansen** dan **Duwi**.
   Tulis namanya persis seperti di data lama (`Hansen`, `Duwi`) supaya riwayat menyambung.
5. Coba dulu beberapa hari berdampingan dengan dashboard lama (keduanya menulis ke tabel yang sama).
6. **Saat siap pindah** — jalankan `supabase/migrations/002_lockdown.sql`.
   Mulai saat itu data hanya bisa diakses akun yang login; dashboard lama berhenti berfungsi.
   Website booking lama tetap bisa cek jam & kirim booking.
7. Cetak ulang QR meja dari menu **Katalog** (alamatnya berubah menjadi `/pesan/jtb` dan `/pesan/adw`).

## Nota, tagihan DP & tanda jadi

Jalankan `supabase/migrations/003_nota.sql` di SQL Editor (aman diulang; hanya menambah). Setelah itu
tiap kartu di **Booking** dan **Job Luar** punya tombol:

- **Kirim tagihan / tanda jadi / bukti lunas lewat WhatsApp**: membuka WhatsApp dengan pesan yang sudah
  terisi dan tautan nota. Admin yang menekan kirim; tidak ada pengiriman otomatis (tanpa API, tanpa risiko nomor diblokir).
- **Lihat nota**: halaman publik `/nota/<token>` yang bisa dibuka customer tanpa login, bisa dicetak / disimpan PDF.

Tautannya tetap sama dan isinya mengikuti uang yang tercatat: sebelum DP masuk tampil *Tagihan*
(dengan QRIS cabang), setelah DP *Tanda Jadi*, setelah lunas *Bukti Lunas*, bila dibatalkan *Dibatalkan*.
Token 64 karakter acak dibuat database; nomor HP dan catatan internal tidak ditampilkan.
Pemilik mengisi nomor WhatsApp cabang dan ketentuan (mis. aturan DP) di **Katalog › Atur teks pada nota**.
Tanpa isian itu, nota hanya memuat kalimat netral.

## Pengingat

- **Di aplikasi** (selalu aktif): pita pengingat di atas semua halaman + angka di menu, untuk
  hasil edit yang telat / jatuh tempo ≤ besok dan job luar ≤ H-4.
- **Hasil edit masuk antrean otomatis** saat booking atau job luar ditandai selesai, dan saat paket
  Foto Keluarga / Wisuda / Pas Foto / Single / Cetak dibayar di kasir. Self Photo & Photobox tidak
  (filenya langsung jadi). Batas kirim bawaan: Pas Foto 1 hari, foto studio & cetak 3 hari,
  job luar 7 hari — diatur di fungsi `edit_hari` (file migrasi). Hanya pemilik yang bisa memundurkan batas.
- **Ke HP lewat Telegram** (opsional): isi `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
  di Vercel. Tiap 08.00 WIB grup menerima daftar yang telat, jatuh tempo, dan job luar terdekat.

## Menjalankan di komputer sendiri

```bash
cp .env.example .env.local   # lalu isi kuncinya
npm install
npm run dev
```

## Catatan rancangan

- **Login**: Supabase Auth. Username diubah menjadi email internal `username@msstudio.local`
  (bisa diganti lewat env `AUTH_EMAIL_DOMAIN`). Sandi di-hash oleh Supabase.
- **Hak akses** ditegakkan database (RLS), bukan browser: karyawan boleh melihat & menambah,
  hanya pemilik yang boleh menghapus/mengubah buku kas, katalog, dan akun.
- **Harga & total dihitung di database** (`pos_checkout`, `create_public_order`), jadi tidak bisa
  dimanipulasi dari HP customer. Pesanan + item + pemasukan tersimpan dalam satu transaksi.
- **Ringkasan dihitung di database** (`ringkasan`, `posisi_kas`); halaman tidak lagi mengunduh semua baris.
- Tabel lama yang belum dipakai (config, alokasi, event, notes, sop_*, leads) tidak dihapus —
  hanya ditutup dari akses luar oleh `002_lockdown.sql`.
