/**
 * Posisi perangkat untuk tombol "lokasi saya" di kedua form lapor.
 *
 * Ponsel murah di dalam ruangan atau di bawah tajuk pohon sering gagal dapat
 * fix akurasi tinggi dalam 10 detik. Gagal selain izin ditolak dicoba sekali
 * lagi dengan akurasi rendah (jaringan/Wi-Fi) dan posisi tersimpan ≤ 1 menit —
 * titik kasar jauh lebih berguna bagi petugas daripada tidak ada titik.
 *
 * Ditolak dengan GeolocationPositionError; `code === 1` = izin ditolak.
 */
export function ambilPosisi(): Promise<GeolocationPosition> {
  const coba = (opsi: PositionOptions) =>
    new Promise<GeolocationPosition>((ok, gagal) =>
      navigator.geolocation.getCurrentPosition(ok, gagal, opsi),
    );
  return coba({ enableHighAccuracy: true, timeout: 10_000 }).catch((e: GeolocationPositionError) => {
    if (e.code === 1) throw e;
    return coba({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 });
  });
}

/** Izin lokasi ditolak (bukan sekadar sinyal lemah)? */
export function izinDitolak(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === 1;
}
