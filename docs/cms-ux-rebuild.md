# CMS UX rebuild — ruang kerja ala MonoCode

Rujukan: [hardbeat920/monocode](https://github.com/hardbeat920/monocode) —
bukan cuma warnanya (sudah di `cms-rebuild.md`), tapi **perilakunya**:

- Satu jendela setinggi layar. Halaman tidak bergulir; tiap panel bergulir sendiri.
- Daftar di kiri tetap terbuka; item yang dipilih terbuka di sampingnya.
  Pindah item = panel kanan saja yang berganti, daftar & guliran tetap.
- Kepala panel tipis (judul + ×), aksi di kepala, bukan tombol "← kembali".
- Perintah cepat ⌘K, pintasan papan ketik (J/K, /, Esc).
- Simpan = tetap di tempat + toast, bukan dilempar balik ke daftar.

Cara lanjut: kerjakan `[ ]` pertama dari atas; centang setelah terverifikasi.

## Keputusan

- **Daftar hidup di `layout.tsx` tiap bagian.** Layout tidak dirender ulang
  saat pindah anak → daftar, guliran, dan isian cari tidak berkedip. Layout
  tidak bisa membaca `searchParams`, jadi **saringan daftar disimpan di cookie**
  (`cms-saring-<bagian>`, path `/admin`) — klien menulis cookie lalu
  `router.refresh()`; server membaca & memvalidasinya. Tautan rincian jadi
  polos (`/admin/laporan/12`), tak perlu menyeret query.
- **Tautan saringan dari tempat lain** (mis. "komentar kejadian ini") lewat
  `TautanSaring` (klien: tulis cookie → buka bagian).
- **Penjaga perubahan** global: form di panel rincian yang sudah diketik diberi
  `data-kotor`; klik tautan lain / tutup tab ditahan sekali dengan peringatan.
  Daftar & palet ditandai `data-tanpa-jaga`.
- **Zustand** tetap sempit: toast (+ tautan opsional) dan preferensi sidebar.
- **Reaksi pindah** ke `/admin/reaksi` (dulu di bawah `/admin/komentar`, yang
  kini punya layout daftar sendiri). Jalur lama dialihkan di `next.config`.
- Suka, Reaksi, Statistik, Biometrik, Ringkasan = satu panel (tanpa rincian).

## Fase D — Kerangka

- [x] D1 Shell setinggi layar (`h-dvh`), `main` jadi wadah gulir; bar atas ponsel
- [x] D2 `Ruang` (daftar | rincian) + `KopPanel` + `BarisDaftar` (aktif dari pathname) + kosong-rincian
- [x] D3 Saringan cookie: `bacaSaring` (server) + `useSaring` (klien) + `TautanSaring`
- [x] D4 Penjaga perubahan (`data-kotor`, beforeunload, klik tertahan)
- [x] D5 Pintasan: J/K pindah baris (panah dibiarkan untuk menggulir), `/` cari, Esc tutup rincian
- [x] D6 Palet ⌘K: bagian, aksi cepat, cari kejadian/laporan/komentar (route `GET /admin/cari`)
- [x] D7 Toast boleh membawa tautan

## Fase E — Bagian

- [x] E1 Kejadian: daftar (cari, status tayang) + rincian = form; simpan tetap di tempat; buat → buka yang baru; hapus → tutup
- [x] E2 Laporan: daftar (status) + rincian; putuskan → lanjut otomatis ke laporan berikutnya
- [x] E3 Komentar: daftar (cari, status, kejadian) + **rincian baru** (isi, konteks, sunting, setujui/sembunyikan/hapus, lanjut ke berikutnya)
- [x] E4 Pengguna: daftar + rincian; simpan tetap di tempat
- [x] E5 Suka, Reaksi (pindah), Statistik, Biometrik, Ringkasan → panel tunggal
- [x] E6 Bersihkan sisa: `Paginasi`/`KopHalaman`/banner `?kabar=` yang tak terpakai, tautan lama

## Fase F — Verifikasi

- [x] F1 tsc, eslint, `npm test`
- [x] F2 `next build --webpack` (salinan scratchpad)
- [x] F3 Uji peramban: pindah item tanpa daftar berkedip, saringan bertahan, simpan di tempat, penjaga perubahan, ⌘K, ponsel

Catatan (2026-10-05):
- F1: tsc bersih, eslint bersih, `npm test` 66/66. F2: `next build --webpack` lulus.
- F3 (CDP, dev lokal, 1440 gelap/terang + 390): daftar adalah elemen DOM yang
  sama setelah pindah rincian & gulirannya bertahan; J/K/Esc; penjaga menahan
  klik saat form kotor lalu melepas di klik kedua; saringan Draft bertahan
  setelah muat ulang; ⌘K buka bagian + cari server; simpan kejadian tetap di
  tempat; sembunyikan komentar → lanjut ke berikutnya (dipulihkan lagi);
  pengguna tambah → terbuka, ubah → tetap, hapus → tutup (akun uji 0 tersisa);
  `/admin/komentar/reaksi` dialihkan; ponsel tanpa gulir samping.
- Ditemukan & diperbaiki saat uji: hidrasi palet (label tema), fokus palet,
  daftar tidak tersegarkan setelah tambah/putuskan (layout tidak ikut dirender
  saat pindah halaman → `router.refresh()` sesudah `push`).
- Belum diuji klik: verifikasi/tolak laporan (data lokal tanpa laporan).

## Fase G — Ganti arah: tabel data + form halaman penuh (permintaan pengguna)

Pengguna: daftar ala MonoCode (daftar | rincian) tidak diinginkan — daftar
memakai **tabel data**; yang dibawa dari rebuild adalah **perilaku CRUD/form**.
Form dibuka **halaman penuh** (dipilih dari: panel samping / halaman penuh / modal).

- [x] G1 Bongkar ruang dua-panel (layout daftar per bagian, J/K, `BarisDaftar`)
- [x] G2 `Tabel` + `KepalaUrut` (urut kolom, `aria-sort`) + `PagerDaftar` bernomor; saringan/urut/halaman tetap di cookie → kembali dari form mendarat di tabel yang sama
- [x] G3 Tabel: Kejadian (Tayang/Draft per baris), Laporan, Komentar (setujui/sembunyikan/hapus per baris), Pengguna (saring peran), Suka, Reaksi
- [x] G4 Halaman form: ← kembali (Esc), simpan di tempat + toast, penjaga perubahan, "Berikutnya ›" + lanjut otomatis setelah memutuskan (dihitung server, saringan yang sama)
- [x] G5 Ponsel: kolom sekunder disembunyikan, aksi baris komentar pindah ke rincian
- [x] G6 Verifikasi: tsc, eslint, `npm test` 66/66, `next build --webpack`, uji CDP 23/23 (urut naik/turun/bawaan, cari, Esc kembali dengan saringan utuh, penjaga, simpan di tempat, aksi baris, lanjut ke komentar berikutnya, CRUD pengguna, ponsel tanpa gulir samping)
