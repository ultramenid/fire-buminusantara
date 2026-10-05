import Redis, { type RedisOptions } from "ioredis";

/**
 * Modul koneksi Redis terpusat dengan fail-open / graceful fallback.
 *
 * Bila variabel REDIS_URL tidak disetel atau server Redis tidak dapat dijangkau,
 * fungsi-fungsi di sini mengembalikan null secara anggun tanpa melempar error (fail-open),
 * sehingga sistem dapat langsung mundur (fallback) ke in-memory cache bawaan.
 */

const REDIS_URL = process.env.REDIS_URL;

let redisKlien: Redis | null = null;
let redisErrorTerakhir = 0;

function buatKlienRedis(): Redis | null {
  if (!REDIS_URL) {
    return null;
  }

  try {
    const opsi: RedisOptions = {
      lazyConnect: true,
      connectTimeout: 3000,
      commandTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (kali) => {
        // Coba sambung ulang bertahap maksimal tiap 15 detik
        return Math.min(kali * 2000, 15000);
      },
    };

    const klien = new Redis(REDIS_URL, opsi);

    klien.on("error", (err) => {
      const sekarang = Date.now();
      // Batasi log galat agar tidak membanjiri terminal setiap frame (tiap 30 detik)
      if (sekarang - redisErrorTerakhir > 30000) {
        redisErrorTerakhir = sekarang;
        console.warn("[Redis] Peringatan koneksi Redis:", err?.message || err);
      }
    });

    return klien;
  } catch (err) {
    console.warn("[Redis] Gagal menginisialisasi klien Redis:", err);
    return null;
  }
}

// Simpan instans di globalThis agar HMR di `next dev` tidak membuat koneksi berulang
const ruang = globalThis as typeof globalThis & { __redisKlien?: Redis | null };

if (typeof ruang.__redisKlien === "undefined") {
  ruang.__redisKlien = buatKlienRedis();
}

redisKlien = ruang.__redisKlien;

/**
 * Memastikan koneksi Redis sudah terhubung sebelum menjalankan perintah.
 */
async function pastikanTerhubung(): Promise<Redis | null> {
  if (!redisKlien) return null;
  if (redisKlien.status === "ready") return redisKlien;
  if (redisKlien.status === "wait" || redisKlien.status === "connecting" || redisKlien.status === "connect") {
    try {
      await redisKlien.connect();
      return redisKlien;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Mengambil string dari Redis berdasarkan kunci.
 */
export async function redisGet(kunci: string): Promise<string | null> {
  try {
    const klien = await pastikanTerhubung();
    if (!klien) return null;
    return await klien.get(kunci);
  } catch {
    return null;
  }
}

/**
 * Menyimpan string ke Redis dengan TTL (detik) opsional.
 */
export async function redisSet(kunci: string, nilai: string, ttlDetik?: number): Promise<boolean> {
  try {
    const klien = await pastikanTerhubung();
    if (!klien) return false;
    if (ttlDetik && ttlDetik > 0) {
      await klien.set(kunci, nilai, "EX", ttlDetik);
    } else {
      await klien.set(kunci, nilai);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Naikkan penghitung dan pasang TTL saat pertama dibuat (jendela tetap).
 * `null` = Redis tidak tersedia; pemanggil memakai cadangannya sendiri.
 */
export async function redisIncr(kunci: string, ttlDetik: number): Promise<number | null> {
  try {
    const klien = await pastikanTerhubung();
    if (!klien) return null;
    const n = await klien.incr(kunci);
    // TTL hanya saat kunci lahir (jendela tetap). Bukan EXPIRE … NX: itu
    // butuh Redis ≥ 7, dan versi lama akan diam-diam jatuh ke cadangan memori.
    if (n === 1) await klien.expire(kunci, ttlDetik);
    return n;
  } catch {
    return null;
  }
}

/**
 * Mengambil binary buffer dari Redis berdasarkan kunci.
 */
export async function redisGetBuffer(kunci: string): Promise<Buffer | null> {
  try {
    const klien = await pastikanTerhubung();
    if (!klien) return null;
    return await klien.getBuffer(kunci);
  } catch {
    return null;
  }
}

/**
 * Menyimpan binary buffer / Uint8Array ke Redis dengan TTL (detik) opsional.
 */
export async function redisSetBuffer(
  kunci: string,
  nilai: Buffer | Uint8Array,
  ttlDetik?: number
): Promise<boolean> {
  try {
    const klien = await pastikanTerhubung();
    if (!klien) return false;
    const buf = Buffer.isBuffer(nilai) ? nilai : Buffer.from(nilai.buffer, nilai.byteOffset, nilai.byteLength);
    if (ttlDetik && ttlDetik > 0) {
      await klien.set(kunci, buf, "EX", ttlDetik);
    } else {
      await klien.set(kunci, buf);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Memeriksa apakah Redis aktif dan dapat merespons PING.
 */
export async function periksaKoneksiRedis(): Promise<boolean> {
  try {
    const klien = await pastikanTerhubung();
    if (!klien) return false;
    const hasil = await klien.ping();
    return hasil === "PONG";
  } catch {
    return false;
  }
}
