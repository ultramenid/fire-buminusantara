# CMS rebuild — rupa MonoCode + CRUD lengkap

Rujukan rupa: [hardbeat920/monocode](https://github.com/hardbeat920/monocode) —
aplikasi desktop gelap yang padat: abu netral (hsl 240 0%), garis 7% tinta,
isian terpilih berupa rona tinta (8–20%), satu aksen biru `hsl(211 92% 62%)`,
huruf sistem, label kalimat biasa (bukan KAPITAL berspasi), sidebar daftar.

Tujuan: andal, sederhana, fungsional, intuitif, mulus.

Cara lanjut: kerjakan item `[ ]` pertama dari atas; centang begitu selesai
dan terverifikasi. Catatan per fase di bawah tiap fase.

## Keputusan

- **Tema mengikuti sakelar situs** (`next-themes`, kelas `dark` di `<html>`,
  bawaan = sistem). Token CMS ditulis dua kali: terang & gelap. Tanpa
  penyedia tema kedua.
- **Zustand dipakai di tempat yang memang ia menangkan**: antrean toast global
  (aksi di komponen mana pun → satu umpan balik) dan preferensi UI per-perangkat
  (sidebar ciut, dipersist). Data CMS tetap di server (RSC + server action) —
  memindahkannya ke store klien justru menambah basi & dobel-sumber, tidak
  mempercepat apa pun.
- **Font Plex dibuang** dari CMS → huruf sistem + `ui-monospace` (3 unduhan
  font lebih sedikit, sama seperti MonoCode).
- **Sesi diverifikasi ke DB tiap permintaan** (`cache()` per render) supaya
  ubah peran / hapus akun langsung berlaku, bukan setelah JWT 8 jam habis.

## Fase A — Fondasi rupa

- [x] A1 Pasang `zustand`; store `app/admin/toko.ts` (toast + sidebar ciut, persist)
- [x] A2 `<Toaster>` di layout; helper `kabari()` untuk komponen klien
- [x] A3 Tulis ulang token `cms.css`: palet MonoCode terang/gelap, huruf sistem, label kalimat, kontrol padat, fokus biru
- [x] A4 Bersihkan titik yang mengandaikan kertas terang (`bg-white`, `bg-[var(--jelaga)] text-white`, hex mentah)
- [x] A5 Kerangka: sidebar berkelompok + ikon + bisa diciutkan + sakelar tema; bar atas sempit di ponsel
- [x] A6 `KopHalaman` & daftar: kepala padat, baris daftar ala MonoCode (panel bergaris, baris dipisah garis)
- [x] A7 Login, loading, not-found, error ikut rupa baru

Catatan A:
- `cms.css` kini di `@layer components` — utility Tailwind di markup menang
  atas kelas CMS (dulu `w-56` / `text-…` di markup kalah diam-diam).
- Nama token & kelas lama dipertahankan; ±45 berkas tidak perlu ditulis ulang.
- Grid daftar `grid-cols-1` + `overflow-wrap` di `.cms`: komentar berupa satu
  "kata" panjang tidak lagi membuat halaman ponsel bergulir ke samping.
- Sesi paralel menambah menu **Biometrik** (passkey) ke sidebar baru — dipertahankan.

## Fase B — CRUD yang belum ada

| Bagian | C | R | U | D | Catatan |
|---|---|---|---|---|---|
| Kejadian | ✓ | ✓ | ✓ | ✓ | sudah |
| Laporan warga | publik | ✓ | ✓ | ✓ | dibuat warga; dibuat-admin = Kejadian |
| Komentar | publik | ✓ | **B2** | ✓ | U = sunting isi (redaksi data pribadi) |
| Reaksi | publik | ✓ | — | **B3** | hapus reaksi spam |
| Suka | publik | ✓ | — | **B3** | hapus suka spam |
| Statistik | tunggal | ✓ | ✓ | — | satu baris konfigurasi |
| Pengguna | ✓ | ✓ | **B1** | **B1** | |

- [x] B0 `bacaSesi` verifikasi ke DB (akun ada, peran admin/editor, nama terkini)
- [x] B1 Pengguna: sunting nama/email/peran, setel ulang sandi, hapus (bukan diri sendiri, bukan admin terakhir)
- [x] B2 Komentar: sunting isi; aksi setujui/hapus kembalikan `{ok, galat}` (bukan lempar)
- [x] B3 Suka & Reaksi: hapus per baris (admin)
- [x] B4 Umpan balik seragam: aksi di tempat → toast; banner `?kabar=` tetap untuk hasil pindah halaman

Catatan B:
- B0: token membawa `sv` (sidik hash sandi). Semua sesi lama gugur sekali saat
  deploy → semua editor masuk ulang sekali. Ganti sandi sendiri menerbitkan
  token baru (tidak terlempar).
- B1: peran sendiri tidak bisa diubah; admin terakhir tidak bisa diturunkan /
  dihapus; "Commenter" = cabut akses tanpa menghapus akun Pasopati.
- B4: toast untuk aksi di tempat (setujui, sembunyikan, hapus, tayang, sunting
  isi, hapus suka/reaksi, hapus akun). Banner `?kabar=` dipertahankan untuk
  hasil yang berpindah halaman (simpan kejadian/pengguna, verifikasi) — ia
  menetap dan membawa tautan ("Buka kejadian →").

## Fase C — Verifikasi

- [x] C1 `tsc`, eslint, `npm test`, `test:db`
- [x] C2 `next build --webpack` (salinan scratchpad)
- [x] C3 Uji peramban: terang/gelap, ciut sidebar, ponsel, tiap CRUD baru

Catatan C (2026-10-05):
- tsc bersih, eslint bersih, `npm test` 66/66, `test:db` 3/3 + migrate diff 0
  (MariaDB 11 sekali pakai), `next build --webpack` lulus.
- Uji alur lewat CDP di dev lokal: pengguna (galat validasi menyimpan isian,
  buat, ubah, hapus dua-tekan + toast, hapus diri sendiri tidak ditawarkan),
  sidebar ciut bertahan setelah muat ulang, sunting isi komentar (+ dipulihkan),
  isi kosong ditolak, hapus suka uji. Hapus reaksi memakai aksi + tombol yang
  sama dengan suka — belum diklik (data lokal kosong).
