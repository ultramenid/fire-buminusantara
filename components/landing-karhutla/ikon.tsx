/* Ikon-ikon dasbor karhutla — SVG kecil tanpa state, dipakaiLintas modul
   landing-karhutla (komposer, cuaca, postingan, bilah tab, saran lokasi). */

export function IkonCari({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IkonLokasi({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
         className={className}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
    </svg>
  );
}

export function IkonTutup({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4"
         strokeLinecap="round" className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** Ikon cuaca garis putih meniru IkonMatahari: matahari/bulan, awan, hujan, petir, kabut. */
export function IkonCuaca({ kode, siang, className = "size-14" }: { kode: number | null; siang: boolean; className?: string }) {
  const g = (isi: string) => (
    <svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <g dangerouslySetInnerHTML={{ __html: isi }} />
    </svg>
  );
  if (kode === null) return g('<circle cx="24" cy="24" r="9" /><path d="M24 4v5M24 39v5M4 24h5M39 24h5M10 10l3.5 3.5M34.5 34.5 38 38M38 10l-3.5 3.5M13.5 34.5 10 38" />');
  if (kode === 0) {
    return siang
      ? g('<circle cx="24" cy="24" r="9" /><path d="M24 4v5M24 39v5M4 24h5M39 24h5M10 10l3.5 3.5M34.5 34.5 38 38M38 10l-3.5 3.5M13.5 34.5 10 38" />')
      : g('<path d="M30 8a13 13 0 1 0 10 16A15 15 0 0 1 30 8Z" /><path d="M36 6v4M40 4v3" />');
  }
  if (kode <= 3) {
    return siang
      ? g('<circle cx="18" cy="18" r="6" /><path d="M18 6v3M6 18h3M9.5 9.5l2 2M26.5 9.5l-2 2" /><path d="M16 38h14a7 7 0 0 0 1.5-13.8A10 10 0 0 0 12 26a6.5 6.5 0 0 0 4 12Z" />')
      : g('<path d="M30 6a9 9 0 1 0 7 12A11 11 0 0 1 30 6Z" /><path d="M16 38h14a7 7 0 0 0 1.5-13.8A10 10 0 0 0 12 26a6.5 6.5 0 0 0 4 12Z" />');
  }
  if (kode === 45 || kode === 48) return g('<path d="M14 18h16a7 7 0 0 0 1.5-13.8A10 10 0 0 0 12 6a6.5 6.5 0 0 0 2 12Z" /><path d="M10 26h28M12 32h24M10 38h28" />');
  if ((kode >= 51 && kode <= 67) || (kode >= 80 && kode <= 82)) return g('<path d="M14 26h16a7 7 0 0 0 1.5-13.8A10 10 0 0 0 12 14a6.5 6.5 0 0 0 2 12Z" /><path d="M16 32l-2 5M24 32l-2 5M32 32l-2 5M40 32l-2 5" />');
  if (kode >= 71 && kode <= 77) return g('<path d="M14 24h16a7 7 0 0 0 1.5-13.8A10 10 0 0 0 12 12a6.5 6.5 0 0 0 2 12Z" /><path d="M17 30v.1M25 30v.1M33 30v.1M21 36v.1M29 36v.1M17 42v.1M25 42v.1M33 42v.1" />');
  return g('<path d="M14 24h16a7 7 0 0 0 1.5-13.8A10 10 0 0 0 12 12a6.5 6.5 0 0 0 2 12Z" /><path d="M24 28l-6 10h5l-2 6 8-12h-5l3-4h-3Z" />');
}

/* Ikon-ikon komposer ala X: garis tipis 1.8, ukuran seragam. */
export function IkonFoto({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5.5 18 5-5 3 3 2.5-2.5 2.5 2.5" />
    </svg>
  );
}

export function IkonVideo({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="m15 10.5 6-3.5v10l-6-3.5" />
    </svg>
  );
}

export function IkonPin({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
         className={className}>
      <path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.3" />
    </svg>
  );
}

export function IkonOrang({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

/* Ikon suara video ala IG: speaker + gelombang (bersuara) / speaker + silang
   (bisu), dan panah melingkar untuk putar ulang. Garis 1.9 ala ikon tab. */
export function IkonSuara({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.2 6a9 9 0 0 1 0 12" />
    </svg>
  );
}

export function IkonBisu({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </svg>
  );
}

export function IkonUlang({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4.5V10h5.5" />
    </svg>
  );
}

/* Segitiga yang MENITIK BERATKAN DIRI SENDIRI: titik berat (8+20+8)/3 dan
   (4+12+20)/3 jatuh tepat di 12,12 — pusat viewBox. Bentuk lama (6 3, 20 12,
   6 21) titik beratnya di x=10,67 sementara kotak batasnya berpusat di 13,
   dan pemanggilnya menambal itu dengan translate-x-0.5; dua koreksi yang
   bertumpuk membuat segitiga terukur 2,58px ke kanan dari pusat lingkaran
   28px. Dengan bentuk ini penambal itu tak diperlukan lagi. */
export function IkonPutarBadge({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className={className}>
      <polygon points="8 4 20 12 8 20" />
    </svg>
  );
}

/* Ikon menu lembar — garis 1.8 ala rujukan. */
export function IkonBagikan({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" />
    </svg>
  );
}

/* Ikon bilah tab seluler — garis 2, gaya X. */
export function IkonBeranda({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m4 11 8-7 8 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export function IkonPlus({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IkonTulis({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/* Ikon penyeberang section: panel (peta terlipat) dan umpan (tumpukan foto).
   Panel memakai peta, bukan kisi instrumen seperti dulu — isi halaman yang
   dituju memang peta sebaran, dan kisi abstrak tak memberi petunjuk apa pun
   soal itu. Bukan pin lokasi: berkas ini sudah punya IkonPin dan IkonLokasi,
   dan pin terbaca "tempat ini", bukan "peta". */
export function IkonPanel({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6.2 9 4 15 6.2 21 4 21 17.8 15 20 9 17.8 3 20 Z" />
      <path d="M9 4V17.8" />
      <path d="M15 6.2V20" />
    </svg>
  );
}

export function IkonUmpan({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="4" width="7" height="10" rx="1.5" />
      <rect x="13" y="4" width="7" height="6" rx="1.5" />
      <rect x="13" y="12" width="7" height="8" rx="1.5" />
      <rect x="4" y="16" width="7" height="4" rx="1.5" />
    </svg>
  );
}