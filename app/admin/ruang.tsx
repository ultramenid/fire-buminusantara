import Link from "next/link";
import { Ikon } from "./menu-admin";
import { Remah } from "./ruang-klien";

const KOLOM_ISI = "mx-auto w-full max-w-[920px] px-4 sm:px-6 lg:px-8";
const KOLOM_LEBAR = "mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8";

/** Pias isi halaman form / rincian — kolom sempit di tengah. */
export const ISI = `${KOLOM_ISI} pt-5 pb-12`;
/** Pias halaman tabel / editor dua kolom — lebih lebar, tidak selebar layar. */
export const LEBAR = `${KOLOM_LEBAR} pt-5 pb-12`;

/**
 * Kepala halaman, dua lapis:
 *  1. Bilah atas yang menempel — ← kembali, remah roti, aksi di kanan.
 *  2. Kepala halaman yang ikut tergulir — mata kecil, judul besar, deskripsi.
 * Isinya sekolom dengan isi halaman (`lebar` untuk halaman yang memakai LEBAR).
 */
export function KopPanel({ mata, judul, deskripsi, kembali, lebar, children, sisi }: {
  /** Label kecil di atas judul (bagian, nomor catatan, tanggal). */
  mata?: string;
  judul: string;
  /** Satu-dua kalimat penjelas di bawah judul. */
  deskripsi?: React.ReactNode;
  /** Jalur tabel asalnya. Esc juga menuju ke sini (lihat Pintasan). */
  kembali?: string;
  lebar?: boolean;
  /** Aksi di bilah atas (menempel saat digulir). */
  children?: React.ReactNode;
  /** Penanda di samping judul besar, mis. cap status. */
  sisi?: React.ReactNode;
}) {
  const kolom = lebar ? KOLOM_LEBAR : KOLOM_ISI;
  return (
    <>
      <header className="cms-kop-panel sticky top-0 z-10">
        <div className={`${kolom} flex items-center gap-2`}>
          {kembali && (
            <Link href={kembali} data-kembali aria-label="Kembali" title="Kembali (Esc)" className="cms-ikon-tombol -ml-1.5">
              <Ikon nama="kiri" />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <Remah judul={judul} />
          </div>
          {children && <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{children}</div>}
        </div>
      </header>
      <div className={`${kolom} cms-kepala`}>
        {mata && <p className="cms-mata mb-1">{mata}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="min-w-0 [overflow-wrap:anywhere]">{judul}</h1>
          {sisi}
        </div>
        {deskripsi && <p data-deskripsi>{deskripsi}</p>}
      </div>
    </>
  );
}

/** Tombol "Tambah …" di kepala halaman tabel. */
export function TombolTambah({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="cms-tombol cms-tombol--utama cms-tombol--kecil">
      <Ikon nama="tambah" className="size-3.5" />
      {label}
    </Link>
  );
}

/** Bidang berbingkai dengan kepala (judul, deskripsi, aksi) dan kaki opsional. */
export function Kartu({ judul, deskripsi, aksi, kaki, bahaya, className = "", isi = "cms-kartu__isi", children }: {
  judul?: React.ReactNode;
  deskripsi?: React.ReactNode;
  /** Di kanan kepala kartu. */
  aksi?: React.ReactNode;
  kaki?: React.ReactNode;
  /** Zona berbahaya (hapus): bingkai & judul merah tipis. */
  bahaya?: boolean;
  className?: string;
  /** Kelas pembungkus isi — kosongkan ("") untuk isi tanpa pias, mis. daftar bergaris. */
  isi?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={`cms-kartu ${bahaya ? "cms-kartu--bahaya" : ""} ${className}`}>
      {(judul || aksi) && (
        <div className="cms-kartu__kepala">
          <div className="min-w-0 flex-1">
            {judul && <h2>{judul}</h2>}
            {deskripsi && <p>{deskripsi}</p>}
          </div>
          {aksi && <div className="flex shrink-0 items-center gap-1.5">{aksi}</div>}
        </div>
      )}
      {children !== undefined && <div className={isi}>{children}</div>}
      {kaki && <div className="cms-kartu__kaki">{kaki}</div>}
    </section>
  );
}

/**
 * Bilah keputusan di bawah bilah atas (laporan, komentar): menempel, sekolom
 * dengan isi halaman — keputusan adalah alasan halaman itu dibuka.
 */
export function BilahAksi({ lebar, children }: { lebar?: boolean; children: React.ReactNode }) {
  return (
    <div className="sticky top-12 z-[9] mt-4">
      <div className={lebar ? KOLOM_LEBAR : KOLOM_ISI}>
        <div className="cms-kartu flex flex-wrap items-center gap-2 px-3 py-2.5">{children}</div>
      </div>
    </div>
  );
}

/** Isi bidang kosong: ikon tipis, satu kalimat tebal, satu kalimat penjelas. */
export function Hampa({ judul, children, ikon = "kotak" }: {
  judul?: string; children?: React.ReactNode; ikon?: Parameters<typeof Ikon>[0]["nama"];
}) {
  return (
    <div className="cms-hampa">
      <Ikon nama={ikon} />
      {judul && <strong>{judul}</strong>}
      {children && <span className="max-w-[48ch]">{children}</span>}
    </div>
  );
}

/**
 * Bingkai tabel data: berbingkai, gulir samping di layar sempit (kolom kurang
 * penting disembunyikan per kolom dengan `hidden md:table-cell`), kaki untuk
 * paginasi di dalam bingkai yang sama.
 */
export function Tabel({ kepala, children, kosong, kaki }: {
  kepala: React.ReactNode;
  children: React.ReactNode;
  /** Tampil di dalam bingkai saat tidak ada baris. */
  kosong?: React.ReactNode;
  kaki?: React.ReactNode;
}) {
  return (
    <div className="cms-tabel-bingkai">
      <div className="cms-tabel-gulir">
        <table className="cms-tabel">
          <thead><tr>{kepala}</tr></thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {kosong && <Hampa>{kosong}</Hampa>}
      {kaki && <div className="cms-tabel-kaki">{kaki}</div>}
    </div>
  );
}
