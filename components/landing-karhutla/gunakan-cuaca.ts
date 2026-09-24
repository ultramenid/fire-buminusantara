"use client";

import { useCallback, useEffect, useState } from "react";
import type { Bahasa } from "@/lib/bahasa";

/**
 * Cuaca lokal pengunjung: lokasi + suhu dibaca otomatis dari IP, tanpa
 * meminta izin geolokasi browser.
 *
 * - Muat: judul lokasi menampilkan teks statis (Kalimantan Barat); suhu
 *   menampilkan garis jeda agar tak ada angka bohong sebelum data tiba.
 * - useEffect menembak /api/cuaca-lokal (IP -> kota via ipwho.is +
 *   BigDataCloud, suhu live via Open-Meteo) lalu state ditimpa.
 * - Gagal total: lokasi + suhu cadangan server (DKI Jakarta + suhu live
 *   Monas) - panel tak pernah kosong.
 *
 * Ikon: pakaian WMO weather_code Open-Meteo - 0 cerah (matahari/bulan), 1-3
 * berawan lipat tiga, 45/48 kabut, 51-67 gerimis/hujan, 71-77 salju, 80-82
 * hujan rintik, 95-99 badai petir.
 */
export function useCuacaLokal(bahasa: Bahasa, lokasiAwal: string) {
  const [lokasi, setLokasi] = useState(lokasiAwal);
  const [suhu, setSuhu] = useState<number | null>(null);
  const [kodeCuaca, setKodeCuaca] = useState<number | null>(null);
  const [siang, setSiang] = useState(true);
  const [sumber, setSumber] = useState<"bmkg" | "model" | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [sumberLokasi, setSumberLokasi] = useState<"otomatis" | "gps" | "cari">("otomatis");

  type Muatan = {
    nama?: unknown; suhu?: unknown; kodeCuaca?: unknown; siang?: unknown; sumber?: unknown;
  };
  const terapkan = useCallback((j: Muatan): void => {
    if (typeof j.nama === "string" && j.nama.trim() !== "") setLokasi(j.nama.trim());
    if (typeof j.suhu === "number" && Number.isFinite(j.suhu)) setSuhu(Math.round(j.suhu));
    if (typeof j.kodeCuaca === "number" && Number.isFinite(j.kodeCuaca)) setKodeCuaca(j.kodeCuaca);
    if (typeof j.siang === "boolean") setSiang(j.siang);
    if (j.sumber === "bmkg" || j.sumber === "model") setSumber(j.sumber);
  }, []);

  const cari = useCallback(async (kueri: string): Promise<boolean> => {
    const q = kueri.trim();
    if (!q) return false;
    setMemuat(true);
    try {
      const r = await fetch(`/api/cuaca-lokal?bahasa=${bahasa}&q=${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(12000),
        headers: { Accept: "application/json" },
      });
      if (!r.ok) return false;
      const j = (await r.json()) as Muatan;
      terapkan(j);
      setSumberLokasi("cari");
      try {
        window.localStorage.setItem(
          `lk-cuaca-${bahasa}`,
          JSON.stringify({ t: Date.now(), data: j, sumberLokasi: "cari" })
        );
      } catch {
        /* penyimpanan penuh/diblokir */
      }
      return true;
    } catch {
      return false;
    } finally {
      setMemuat(false);
    }
  }, [bahasa, terapkan]);

  const deteksiGps = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }
    setMemuat(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const r = await fetch(
            `/api/cuaca-lokal?bahasa=${bahasa}&lat=${latitude}&lng=${longitude}`,
            {
              signal: AbortSignal.timeout(12000),
              headers: { Accept: "application/json" },
            }
          );
          if (!r.ok) return;
          const j = (await r.json()) as Muatan;
          terapkan(j);
          setSumberLokasi("gps");
          try {
            window.localStorage.setItem(
              `lk-cuaca-${bahasa}`,
              JSON.stringify({ t: Date.now(), data: j, sumberLokasi: "gps" })
            );
          } catch {
            /* penyimpanan penuh/diblokir */
          }
        } catch {
          // gagal fetch cuaca dari gps
        } finally {
          setMemuat(false);
        }
      },
      () => {
        setMemuat(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, [bahasa, terapkan]);

  useEffect(() => {
    let hidup = true;
    // Cache lokal 15 menit: refresh langsung menampilkan angka terakhir
    // tanpa menunggu rantai server — lalu tetap divalidasi ulang di bawah.
    try {
      const mentah = window.localStorage.getItem(`lk-cuaca-${bahasa}`);
      if (mentah) {
        const { t, data, sumberLokasi: sl } = JSON.parse(mentah) as {
          t: number;
          data: Muatan;
          sumberLokasi?: "otomatis" | "gps" | "cari";
        };
        if (data && typeof t === "number" && Date.now() - t < 15 * 60_000) {
          setTimeout(() => {
            if (!hidup) return;
            terapkan(data);
            if (sl) setSumberLokasi(sl);
          }, 0);
        }
      }
    } catch {
      /* cache rusak: abaikan, fetch segar di bawah */
    }
    // Rantai server (geo-IP + kota + adm4 + BMKG + cadangan) bisa >30 detik
    // saat dingin — sekali coba dengan batas 30 detik kerap gugur tepat di
    // garis finis dan panel macet di garis jeda. Batas 60 detik + sekali
    // ulangi bila gugur.
    const ambil = async (batas: number): Promise<boolean> => {
      try {
        const r = await fetch(`/api/cuaca-lokal?bahasa=${bahasa}`, {
          signal: AbortSignal.timeout(batas),
          headers: { Accept: "application/json" },
        });
        if (!r.ok) return false;
        const j = (await r.json()) as Muatan;
        if (!hidup) return true;
        terapkan(j);
        try {
          window.localStorage.setItem(
            `lk-cuaca-${bahasa}`,
            JSON.stringify({ t: Date.now(), data: j, sumberLokasi: "otomatis" })
          );
        } catch {
          /* penyimpanan penuh/diblokir: abaikan */
        }
        return true;
      } catch {
        return false;
      }
    };
    (async () => {
      if (await ambil(60_000)) return;
      if (hidup) await ambil(60_000);
    })();
    return () => {
      hidup = false;
    };
  }, [bahasa, terapkan]);

  const pilihSaran = useCallback(
    async (item: {
      nama: string;
      provinsi: string;
      lat: number;
      lng: number;
      adm4?: string;
    }): Promise<boolean> => {
      setMemuat(true);
      try {
        const param = new URLSearchParams({
          bahasa,
          lat: String(item.lat),
          lng: String(item.lng),
          nama: item.nama,
          provinsi: item.provinsi,
          ...(item.adm4 ? { adm4: item.adm4 } : {}),
        });
        const r = await fetch(`/api/cuaca-lokal?${param}`, {
          signal: AbortSignal.timeout(12000),
          headers: { Accept: "application/json" },
        });
        if (!r.ok) return false;
        const j = (await r.json()) as Muatan;
        terapkan(j);
        setSumberLokasi("cari");
        try {
          window.localStorage.setItem(
            `lk-cuaca-${bahasa}`,
            JSON.stringify({ t: Date.now(), data: j, sumberLokasi: "cari" })
          );
        } catch {
          /* penyimpanan penuh/diblokir */
        }
        return true;
      } catch {
        return false;
      } finally {
        setMemuat(false);
      }
    },
    [bahasa, terapkan]
  );

  return { lokasi, suhu, kodeCuaca, siang, sumber, memuat, sumberLokasi, cari, deteksiGps, pilihSaran };
}