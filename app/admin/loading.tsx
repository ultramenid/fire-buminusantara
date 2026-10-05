import { LEBAR } from "./ruang";

/** Pindah bagian: kerangka panel tunggal (daftar bagian baru belum datang).
 *  Sekolom dengan KopPanel/LEBAR supaya tidak melompat saat isi tiba. */
export default function LoadingAdmin() {
  return (
    <div aria-busy="true" aria-label="Memuat" className="h-full">
      <div className="cms-kop-panel">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="cms-skeleton h-3.5 w-48" />
        </div>
      </div>
      <div className={`${LEBAR} grid gap-2`}>
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="cms-skeleton h-12 w-full" />)}
      </div>
    </div>
  );
}
