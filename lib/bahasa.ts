/** Dua bahasa situs publik. Urutannya penting: yang pertama adalah bawaan
 *  saat proxy mengalihkan pengunjung tanpa prefiks. */
export const BAHASA = ["id", "en"] as const;
export type Bahasa = (typeof BAHASA)[number];

/** Penjaga tipe seperti di panduan internasionalisasi Next.js —
 *  menyempitkan string dari URL jadi Bahasa, dan sekaligus 404 untuk
 *  segmen yang bukan bahasa yang dikenal. */
export function adaBahasa(nilai: string): nilai is Bahasa {
  return (BAHASA as readonly string[]).includes(nilai);
}

/** Semua teks bilah navigasi per bahasa. Isi halaman menyusul —
 *  saat terjemahannya ada, kumpulan ini yang dilebarkan. */
export const TEKS_NAV = {
  id: {
    navigasi: "Navigasi utama",
    awal: "Ke awal halaman",
    bagian: {
      beranda: "Beranda",
      peta: "Peta Sebaran",
    } as Record<string, string>,
    ganti: "Ganti bahasa",
    lapor: "Lapor",
    bukaNavigasi: "Buka menu",
    tutupNavigasi: "Tutup menu",
  },
  en: {
    navigasi: "Main navigation",
    awal: "Back to top",
    bagian: {
      beranda: "Home",
      peta: "Spread Map",
    } as Record<string, string>,
    ganti: "Switch language",
    lapor: "Report",
    bukaNavigasi: "Open menu",
    tutupNavigasi: "Close menu",
  },
} as const satisfies Record<Bahasa, unknown>;

/** Teks halaman lapor. Halaman ini berada di bawah [locale] seperti yang lain,
 *  jadi seluruh tulisannya — termasuk pesan galat dari peramban — ikut bahasa
 *  yang sedang dibuka. Pesan galat dari SERVER tetap berbahasa Indonesia:
 *  ia datang dari validasi yang sama yang dibaca petugas CMS. */
export const TEKS_LAPOR = {
  id: {
    judulHalaman: "Lapor Kejadian Karhutla",
    catatan:
      "Melihat kebakaran hutan atau lahan? Ceritakan di sini. Laporan diperiksa petugas sebelum ditampilkan.",
    kembali: "Kembali ke beranda",
    labelJudul: "Judul laporan",
    petunjukJudul: "Ringkas saja, mis. “Asap tebal di tepi jalan Trans-Kalimantan”",
    labelDeskripsi: "Apa yang terjadi",
    petunjukDeskripsi: "Kapan Anda melihatnya, seberapa luas, apa yang terbakar.",
    labelBerkas: "Foto atau video",
    petunjukBerkas: "Wajib: minimal satu. JPG, PNG, WebP, MP4, MOV, atau WebM.",
    catatanMetadata:
      "Berkas dikirim apa adanya — data kamera dan lokasi di dalam foto tidak dihapus.",
    pilihBerkas: "Pilih berkas",
    hapusBerkas: "Hapus",
    labelLokasi: "Titik lokasi (opsional)",
    petunjukLokasi: "Kosongkan kalau tidak yakin. Petugas bisa melengkapinya nanti.",
    lat: "Latitude",
    lng: "Longitude",
    pakaiLokasi: "Pakai lokasi saya",
    mencariLokasi: "Mencari lokasi…",
    lokasiGagal: "Lokasi tidak bisa diambil. Isi manual atau kosongkan saja.",
    lokasiDariFoto: "Diisi otomatis dari GPS foto.",
    labelNama: "Nama Anda (opsional)",
    anonim: "Kirim sebagai anonim",
    kirim: "Kirim laporan",
    mengirim: "Mengirim…",
    berhasilJudul: "Laporan terkirim",
    berhasilIsi:
      "Terima kasih. Laporan Anda masuk antrean pemeriksaan petugas dan belum tampil di situs.",
    lagi: "Kirim laporan lain",
    terlaluBesar: "Total berkas melebihi 100 MB. Kurangi atau perkecil dulu.",
    terlaluBanyak: "Maksimal {n} berkas per laporan.",
    berkasWajib: "Sertakan minimal satu foto atau video sebagai bukti.",
  },
  en: {
    judulHalaman: "Report a Wildfire",
    catatan:
      "Seeing a forest or land fire? Tell us here. Reports are checked by staff before they appear.",
    kembali: "Back to home",
    labelJudul: "Report title",
    petunjukJudul: "Keep it short, e.g. “Heavy smoke along the Trans-Kalimantan road”",
    labelDeskripsi: "What happened",
    petunjukDeskripsi: "When you saw it, how large it was, what is burning.",
    labelBerkas: "Photos or video",
    petunjukBerkas: "Required: at least one. JPG, PNG, WebP, MP4, MOV, or WebM.",
    catatanMetadata:
      "Files are sent as-is — the camera and location data inside your photos is not stripped.",
    pilihBerkas: "Choose files",
    hapusBerkas: "Remove",
    labelLokasi: "Coordinates (optional)",
    petunjukLokasi: "Leave empty if unsure. Staff can fill it in later.",
    lat: "Latitude",
    lng: "Longitude",
    pakaiLokasi: "Use my location",
    mencariLokasi: "Locating…",
    lokasiGagal: "Could not read your location. Enter it manually or leave it empty.",
    lokasiDariFoto: "Auto-filled from photo GPS.",
    labelNama: "Your name (optional)",
    anonim: "Submit anonymously",
    kirim: "Send report",
    mengirim: "Sending…",
    berhasilJudul: "Report sent",
    berhasilIsi:
      "Thank you. Your report is queued for review and is not shown on the site yet.",
    lagi: "Send another report",
    terlaluBesar: "Total file size exceeds 100 MB. Remove or shrink some files first.",
    terlaluBanyak: "At most {n} files per report.",
    berkasWajib: "Attach at least one photo or video as evidence.",
  },
} as const satisfies Record<Bahasa, unknown>;