"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Tunggakan } from "@/lib/tunggakan";

const Konteks = createContext<Tunggakan | null>(null);

/**
 * Bagian yang daftarnya memang ikut berubah begitu antrean berubah. Daftar
 * hidup di layout, jadi rinciannya ikut tersegarkan — aman, karena
 * `router.refresh()` hanya mengganti props server (state klien utuh) dan
 * form yang sedang diketik (`data-kotor`, lihat penjaga.tsx) menahan
 * penyegaran sampai disimpan.
 */
const BAGIAN_SEGAR = /^\/admin(\/(komentar|laporan)(\/\d+)?)?$/;

function bolehSegarkan(jalur: string): boolean {
  return BAGIAN_SEGAR.test(jalur) && !document.querySelector("form[data-kotor]");
}

/** Jeda peredam: satu ledakan (tiga laporan masuk beruntun) jadi satu
 *  permintaan, bukan tiga. */
const REDAM_MS = 400;

/**
 * Penyambung CMS ke aliran tunggakan.
 *
 * Dua hal ikut hidup: angka lencana di menu, dan — di halaman yang memang
 * menampilkan antreannya — isi halamannya sendiri lewat `router.refresh()`.
 * Refresh itu memuat ulang Server Component TANPA me-reload dokumen, jadi
 * state klien (pratinjau yang terbuka, konfirmasi yang sedang menunggu tekan
 * kedua, posisi guliran, filter di URL) tetap utuh.
 *
 * Nilai dari server tetap jadi titik awal DAN tetap menang setiap kali server
 * mengirim angka baru: navigasi, `router.refresh()`, dan tombol "Muat ulang"
 * sama-sama membaca database, jadi bila aliran sempat putus angka merekalah
 * yang lebih baru. Di antara dua render itulah aliran mengambil alih.
 */
export function TunggakanHidup({
  awal,
  children,
}: {
  awal: Tunggakan;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const jalur = usePathname();
  const [dariAliran, setDariAliran] = useState<Tunggakan | null>(null);
  const [awalTerakhir, setAwalTerakhir] = useState(awal);

  // Penyetelan state saat render (pola resmi React untuk "state turunan
  // prop"), bukan useEffect: tanpa ini lencana berkedip sekali ke angka lama
  // di setiap navigasi CMS sebelum efeknya sempat berjalan.
  if (
    awal.belumDitinjau !== awalTerakhir.belumDitinjau ||
    awal.laporanMenunggu !== awalTerakhir.laporanMenunggu
  ) {
    setAwalTerakhir(awal);
    setDariAliran(null);
  }

  const nilai = dariAliran ?? awal;

  // Penangan aliran hidup di luar siklus render — ia butuh cermin yang selalu
  // menunjuk keadaan terkini, bukan tangkapan dari render tempat ia dipasang.
  const nilaiRef = useRef(nilai);

  useEffect(() => {
    nilaiRef.current = nilai;
  }, [nilai]);

  const jalurRef = useRef(jalur);
  useEffect(() => {
    jalurRef.current = jalur;
  }, [jalur]);

  useEffect(() => {
    let sumber: EventSource | null = null;
    let jadwalSambung: ReturnType<typeof setTimeout> | null = null;
    let pewaktuSegar: ReturnType<typeof setTimeout> | null = null;
    let tertunda = false;
    let mundur = 3_000;
    let dibuang = false;

    const segarkanSekarang = () => {
      tertunda = false;
      if (!dibuang) router.refresh();
    };

    const mintaSegar = () => {
      // Formulir tidak pernah dimuat ulang di belakang penggunanya.
      if (!bolehSegarkan(jalurRef.current)) return;
      // Tab yang tidak dilihat tidak perlu membebani server: permintaannya
      // ditahan sampai petugas kembali menatap layar — momen satu-satunya di
      // mana kesegaran benar-benar berarti.
      if (document.hidden) {
        tertunda = true;
        return;
      }
      if (pewaktuSegar) clearTimeout(pewaktuSegar);
      pewaktuSegar = setTimeout(() => {
        pewaktuSegar = null;
        segarkanSekarang();
      }, REDAM_MS);
    };

    const saatTerlihat = () => {
      if (document.hidden || !tertunda) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      mintaSegar();
    };

    const sambung = () => {
      if (dibuang) return;
      sumber = new EventSource("/api/admin/tunggakan/aliran");

      sumber.onopen = () => {
        mundur = 3_000;
      };

      sumber.onmessage = (peristiwa) => {
        try {
          const data = JSON.parse(peristiwa.data) as Partial<Tunggakan>;
          const baru: Tunggakan = {
            belumDitinjau: Number(data.belumDitinjau) || 0,
            laporanMenunggu: Number(data.laporanMenunggu) || 0,
          };
          const sebelum = nilaiRef.current;
          nilaiRef.current = baru;
          setDariAliran(baru);

          // Detak jaring 30 detik mengirim angka yang sama berulang-ulang;
          // hanya perubahan sungguhan yang layak memuat ulang daftar.
          if (
            baru.belumDitinjau !== sebelum.belumDitinjau ||
            baru.laporanMenunggu !== sebelum.laporanMenunggu
          ) {
            mintaSegar();
          }
        } catch {
          // Pesan cacat (mis. respons terpotong proxy) diabaikan; detak
          // berikutnya membawa angka utuh.
        }
      };

      // EventSource menyambung ulang sendiri untuk putus biasa, TAPI berhenti
      // permanen bila responsnya bukan text/event-stream — persis yang terjadi
      // saat sesi habis dan rute menjawab 401. Penyambung sendiri ini
      // menyamakan keduanya, dengan mundur berlipat supaya tab yang sesinya
      // benar-benar mati tidak menggedor server tiap tiga detik.
      sumber.onerror = () => {
        sumber?.close();
        sumber = null;
        if (dibuang) return;
        jadwalSambung = setTimeout(sambung, mundur);
        mundur = Math.min(mundur * 2, 60_000);
      };
    };

    document.addEventListener("visibilitychange", saatTerlihat);
    sambung();

    return () => {
      dibuang = true;
      document.removeEventListener("visibilitychange", saatTerlihat);
      if (jadwalSambung) clearTimeout(jadwalSambung);
      if (pewaktuSegar) clearTimeout(pewaktuSegar);
      sumber?.close();
    };
  }, [router]);

  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Angka tunggakan terbaru; jatuh ke nilai render server bila aliran belum
 *  terpasang (mis. menu dirender di luar penyedia). */
export function gunakanTunggakan(cadangan: Tunggakan): Tunggakan {
  // Awalan Indonesia "gunakan" dipakai untuk semua hook kustom di proyek ini
  // (lihat override hooks/** di eslint.config.mjs); rules-of-hooks hanya
  // mengenali awalan "use" dan salah membaca ini sebagai fungsi biasa.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useContext(Konteks) ?? cadangan;
}
