import Blosc from "numcodecs/blosc";

const ZARR_BASE_URL =
  process.env.CAMS_ZARR_BASE_URL ||
  "https://arco.datastores.ecmwf.int/cadl-arco-time-001/arco/cams_global_atmospheric_composition_forecasts/sfc-multiforecast/timeChunked.zarr";
const ZARR_TOKEN =
  process.env.CAMS_ZARR_TOKEN || "fire-watch-827a2651-8e26-4bc1-ac44-9351fcb916af";

// Global geospatial grid dimensions for ECMWF CAMS ARCO Zarr (omaod550)
// Lat: 90°N -> -90°S (step 0.4°, 451 rows)
// Lon: -180° -> +180° (step 0.4°, 900 cols, shifted from raw 0..360°)
export const ZARR_GLOBAL_GRID = {
  rows: 451,
  cols: 900,
  totalPoints: 451 * 900, // 405,900 points
  maxDensityAod: 2.0, // Scale factor: byte 255 = 2.0 AOD
  bounds: [
    [-90.0, -180.0],
    [90.0, 180.0],
  ] as [[number, number], [number, number]],
} as const;

// Backwards-compatible alias if needed
export const ZARR_INDO_GRID = ZARR_GLOBAL_GRID;

export interface ZarrTimestepMeta {
  index: number;
  timeChunk: number;
  timeInner: number;
  step: number;
  iso: string;
  waktu: number;
  labelUtc: string;
  labelWib: string;
  adalahPrediksi: boolean;
}

export interface ZarrMetadataResponse {
  latestModelRunIso: string;
  latestModelRunWib?: string;
  timesteps: ZarrTimestepMeta[];
  grid: {
    rows: number;
    cols: number;
    bounds: [[number, number], [number, number]];
  };
  isWarm?: boolean;
  cachedFramesCount?: number;
}

// In-memory cache & limit
export const MAX_FRAME_CACHE_ENTRIES = 150; // Menampung seluruh ~81 frame sebaran asap (~60 MB RAM)
export const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // Siklus pembersihan tiap 15 menit
let lastCleanupTime = Date.now();

let cachedMetadata: { data: ZarrMetadataResponse; expiresAt: number } | null = null;
const frameCache = new Map<string, { buffer: Uint8Array; expiresAt: number }>();
const bloscCodec = Blosc.fromConfig({ id: "blosc" });

/**
 * Membersihkan entri frame cache dan metadata yang sudah kedaluwarsa dari memori server.
 * Mengembalikan total jumlah entri frame yang berhasil dihapus.
 */
export function bersihkanCacheKedaluwarsa(waktuSekarang: number = Date.now()): number {
  let terhapus = 0;
  for (const [kunci, entri] of frameCache.entries()) {
    if (entri.expiresAt <= waktuSekarang) {
      frameCache.delete(kunci);
      terhapus++;
    }
  }

  if (cachedMetadata && cachedMetadata.expiresAt <= waktuSekarang) {
    cachedMetadata = null;
  }

  return terhapus;
}

/**
 * Mendapatkan jumlah entri frame yang saat ini tersimpan di memori cache server.
 */
export function getJumlahCacheFrame(): number {
  return frameCache.size;
}

/**
 * Mengosongkan seluruh cache memori server (berguna untuk testing atau paksa refresh).
 */
export function kosongkanSemuaCache(): void {
  frameCache.clear();
  cachedMetadata = null;
}

// Timer berkala otomatis di latar belakang (unref agar tidak menahan proses Node.js)
if (typeof setInterval !== "undefined") {
  const timerPembersih = setInterval(() => {
    bersihkanCacheKedaluwarsa();
  }, CLEANUP_INTERVAL_MS);
  if (timerPembersih.unref) {
    timerPembersih.unref();
  }
}

function buatMetaLangkah(
  index: number,
  timeChunk: number,
  timeInner: number,
  stepHour: number,
  baseTimeMs: number,
  adalahPrediksi: boolean
): ZarrTimestepMeta {
  const stepDate = new Date(baseTimeMs + stepHour * 3600 * 1000);
  const iso = stepDate.toISOString().replace(/\.\d{3}Z$/, "Z");
  const waktu = stepDate.getTime();

  const namaBulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
  const tglUtc = stepDate.getUTCDate();
  const blnUtc = namaBulan[stepDate.getUTCMonth()];
  const jamUtc = String(stepDate.getUTCHours()).padStart(2, "0");
  const menitUtc = String(stepDate.getUTCMinutes()).padStart(2, "0");

  const wib = new Date(waktu + 7 * 3600 * 1000);
  const tglWib = wib.getUTCDate();
  const blnWib = namaBulan[wib.getUTCMonth()];
  const jamWib = String(wib.getUTCHours()).padStart(2, "0");
  const menitWib = String(wib.getUTCMinutes()).padStart(2, "0");

  return {
    index,
    timeChunk,
    timeInner,
    step: stepHour,
    iso,
    waktu,
    labelUtc: `${tglUtc} ${blnUtc}, ${jamUtc}:${menitUtc} UTC`,
    labelWib: `${tglWib} ${blnWib}, ${jamWib}:${menitWib} WIB`,
    adalahPrediksi,
  };
}

/**
 * Fetch and parse Zarr metadata to identify available timesteps.
 */
export async function getZarrMetadata(forceRefresh: boolean = false): Promise<ZarrMetadataResponse> {
  const now = Date.now();
  if (!forceRefresh && cachedMetadata && cachedMetadata.expiresAt > now) {
    const isWarm = frameCache.size >= Math.floor(cachedMetadata.data.timesteps.length * 0.7);
    return {
      ...cachedMetadata.data,
      isWarm,
      cachedFramesCount: frameCache.size,
    };
  }

  // Pembersihan pasif berkala jika interval tercapai
  if (now - lastCleanupTime > CLEANUP_INTERVAL_MS) {
    lastCleanupTime = now;
    bersihkanCacheKedaluwarsa(now);
  }

  try {
    const metaUrl = `${ZARR_BASE_URL}/.zmetadata?_fet=${ZARR_TOKEN}`;
    const res = await fetch(
      metaUrl,
      forceRefresh ? { cache: "no-store" } : { next: { revalidate: 600 } }
    );
    if (!res.ok) {
      throw new Error(`Failed to fetch Zarr metadata: ${res.status} ${res.statusText}`);
    }

    const meta = await res.json();
    const omaodArray = meta.metadata["omaod550/.zarray"];
    const totalTimeRuns = omaodArray.shape[0]; // e.g. 233
    const latestTimeIndex = totalTimeRuns - 1; // e.g. 232

    // 7 hari analisis historis (14 model runs ke belakang: 2 run per hari, 28 Agu - 4 Sep)
    const startRunIdx = Math.max(0, latestTimeIndex - 14);

    // Ambil chunk array time untuk run yang dibutuhkan
    const chunkIdxA = Math.floor(startRunIdx / 64);
    const chunkIdxB = Math.floor(latestTimeIndex / 64);

    const timesMap = new Map<number, number>();

    const muatTimeChunk = async (chunkIdx: number) => {
      try {
        const timeRes = await fetch(`${ZARR_BASE_URL}/time/${chunkIdx}?_fet=${ZARR_TOKEN}`);
        if (!timeRes.ok) return;
        const timeBuf = new Uint8Array(await timeRes.arrayBuffer());
        const decodedTime = await bloscCodec.decode(timeBuf);
        const times = new BigInt64Array(decodedTime.buffer, decodedTime.byteOffset, decodedTime.byteLength / 8);
        for (let i = 0; i < times.length; i++) {
          const runIdx = chunkIdx * 64 + i;
          const hoursSince1970 = Number(times[i]);
          if (hoursSince1970 > 0) {
            timesMap.set(runIdx, hoursSince1970 * 3600 * 1000);
          }
        }
      } catch (e) {
        console.warn(`[ZarrReader] Gagal memuat time chunk ${chunkIdx}:`, e);
      }
    };

    await muatTimeChunk(chunkIdxB);
    if (chunkIdxA !== chunkIdxB) {
      await muatTimeChunk(chunkIdxA);
    }

    const latestBaseMs = timesMap.get(latestTimeIndex) || now;
    const latestModelRunIso = new Date(latestBaseMs).toISOString();

    const namaBulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
    const wibRun = new Date(latestBaseMs + 7 * 3600 * 1000);
    const latestModelRunWib = `${wibRun.getUTCDate()} ${namaBulan[wibRun.getUTCMonth()]}, ${String(wibRun.getUTCHours()).padStart(2, "0")}:${String(wibRun.getUTCMinutes()).padStart(2, "0")} WIB`;

    const timesteps: ZarrTimestepMeta[] = [];

    // 1. Periode Analisis 7 Hari Terakhir (Historis, step per 3 jam)
    for (let runIdx = startRunIdx; runIdx < latestTimeIndex; runIdx++) {
      const timeChunk = Math.floor(runIdx / 2);
      const timeInner = runIdx % 2;
      const baseMs = timesMap.get(runIdx) || (latestBaseMs - (latestTimeIndex - runIdx) * 12 * 3600 * 1000);

      for (const stepHour of [0, 3, 6, 9]) {
        timesteps.push(
          buatMetaLangkah(
            timesteps.length,
            timeChunk,
            timeInner,
            stepHour,
            baseMs,
            false // Periode Analisis
          )
        );
      }
    }

    // 2. Periode Prediksi (Hari ini s.d. +72 jam ke depan, step per 3 jam)
    const latestChunk = Math.floor(latestTimeIndex / 2);
    const latestInner = latestTimeIndex % 2;

    for (let stepHour = 0; stepHour <= 72; stepHour += 3) {
      timesteps.push(
        buatMetaLangkah(
          timesteps.length,
          latestChunk,
          latestInner,
          stepHour,
          latestBaseMs,
          stepHour > 0 // Prediksi
        )
      );
    }

    const isWarm = frameCache.size >= Math.floor(timesteps.length * 0.7);
    const result: ZarrMetadataResponse = {
      latestModelRunIso,
      latestModelRunWib,
      timesteps,
      grid: {
        rows: ZARR_GLOBAL_GRID.rows,
        cols: ZARR_GLOBAL_GRID.cols,
        bounds: ZARR_GLOBAL_GRID.bounds,
      },
      isWarm,
      cachedFramesCount: frameCache.size,
    };

    cachedMetadata = {
      data: result,
      expiresAt: now + 15 * 60 * 1000, // cache for 15 minutes
    };

    return result;
  } catch (error) {
    console.error("[ZarrReader] Error fetching metadata:", error);
    // Fallback if network fails
    return getFallbackMetadata();
  }
}

/**
 * Fetch and decode a specific frame chunk for the full global grid.
 * Returns a Uint8Array of 405,900 bytes (451 rows x 900 cols), values 0..255 representing 0..2.0 AOD.
 * Longitude is re-centered to [-180° .. +180°] for standard Web Mercator alignment.
 */
export async function getZarrFrame(timeChunk: number, step: number, timeInner: number = 0): Promise<Uint8Array> {
  const cacheKey = `${timeChunk}_${step}_${timeInner}`;
  const now = Date.now();

  // Pembersihan pasif berkala jika interval tercapai
  if (now - lastCleanupTime > CLEANUP_INTERVAL_MS) {
    lastCleanupTime = now;
    bersihkanCacheKedaluwarsa(now);
  }

  const cached = frameCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.buffer;
  }

  const chunkUrl = `${ZARR_BASE_URL}/omaod550/${timeChunk}.${step}.0.0?_fet=${ZARR_TOKEN}`;
  const res = await fetch(chunkUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch Zarr chunk ${chunkUrl}: ${res.status} ${res.statusText}`);
  }

  const compressedBuffer = new Uint8Array(await res.arrayBuffer());
  const decompressed = await bloscCodec.decode(compressedBuffer);
  const floats = new Float32Array(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength / 4);

  // Chunk shape is [2, 1, 451, 900]
  // Offset for timeInner (0 or 1):
  const timeOffset = timeInner * 451 * 900;
  const rows = ZARR_GLOBAL_GRID.rows; // 451
  const cols = ZARR_GLOBAL_GRID.cols; // 900
  const maxDensityAod = ZARR_GLOBAL_GRID.maxDensityAod;
  const result = new Uint8Array(rows * cols);

  let outIdx = 0;
  for (let r = 0; r < rows; r++) {
    const rowOffset = timeOffset + r * cols;
    for (let c = 0; c < cols; c++) {
      const val = floats[rowOffset + c];
      // Clamp between 0.0 and maxDensityAod, map to 0..255
      const normalized = Math.min(1.0, Math.max(0.0, val / maxDensityAod));
      result[outIdx++] = Math.round(normalized * 255);
    }
  }

  // Jaga batas kapasitas memori RAM
  if (frameCache.size >= MAX_FRAME_CACHE_ENTRIES) {
    bersihkanCacheKedaluwarsa(now);
    while (frameCache.size >= MAX_FRAME_CACHE_ENTRIES) {
      const entriTertua = frameCache.keys().next().value;
      if (entriTertua) {
        frameCache.delete(entriTertua);
      } else {
        break;
      }
    }
  }

  // Cache for 4 hours (overlaps seamlessly with 3-hour cron schedule)
  frameCache.set(cacheKey, {
    buffer: result,
    expiresAt: now + 4 * 3600 * 1000,
  });

  return result;
}

function getFallbackMetadata(): ZarrMetadataResponse {
  const now = Date.now();
  const timesteps: ZarrTimestepMeta[] = [];

  // 14 run historis (7 hari lalu, per 3 jam)
  for (let i = 0; i < 14; i++) {
    const baseMs = now - (14 - i) * 12 * 3600 * 1000;
    const timeChunk = 109 + Math.floor(i / 2);
    const timeInner = i % 2;
    for (const step of [0, 3, 6, 9]) {
      timesteps.push(
        buatMetaLangkah(timesteps.length, timeChunk, timeInner, step, baseMs, false)
      );
    }
  }

  // 25 step prediksi (+0 s.d. +72 jam, per 3 jam)
  for (let step = 0; step <= 72; step += 3) {
    timesteps.push(
      buatMetaLangkah(timesteps.length, 116, 0, step, now, step > 0)
    );
  }

  const isWarm = frameCache.size >= Math.floor(timesteps.length * 0.7);
  const namaBulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
  const wibRun = new Date(now + 7 * 3600 * 1000);
  const latestModelRunWib = `${wibRun.getUTCDate()} ${namaBulan[wibRun.getUTCMonth()]}, ${String(wibRun.getUTCHours()).padStart(2, "0")}:${String(wibRun.getUTCMinutes()).padStart(2, "0")} WIB`;

  return {
    latestModelRunIso: new Date(now).toISOString(),
    latestModelRunWib,
    timesteps,
    grid: {
      rows: ZARR_GLOBAL_GRID.rows,
      cols: ZARR_GLOBAL_GRID.cols,
      bounds: ZARR_GLOBAL_GRID.bounds,
    },
    isWarm,
    cachedFramesCount: frameCache.size,
  };
}

/**
 * Menghangatkan seluruh frame sebaran asap ke dalam memori cache server.
 * Dipanggil oleh cron job background atau script pre-warm.
 */
export async function hangatkanSemuaFrame(
  onProgress?: (selesai: number, total: number) => void,
  forceRefresh: boolean = true
): Promise<{
  total: number;
  berhasil: number;
  gagal: number;
  durasiMs: number;
  isWarm: boolean;
}> {
  const mulai = Date.now();
  const meta = await getZarrMetadata(forceRefresh);
  const total = meta.timesteps.length;
  let berhasil = 0;
  let gagal = 0;
  let next = 0;
  const CONCURRENCY = 5;

  const worker = async () => {
    while (next < total) {
      const idx = next++;
      const stepMeta = meta.timesteps[idx];
      if (stepMeta) {
        try {
          await getZarrFrame(stepMeta.timeChunk, stepMeta.step, stepMeta.timeInner);
          berhasil++;
          onProgress?.(berhasil + gagal, total);
        } catch (e) {
          console.error(`[ZarrReader Pre-warm] Gagal mengunduh frame idx=${idx}:`, e);
          gagal++;
          onProgress?.(berhasil + gagal, total);
        }
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, total) },
    () => worker()
  );
  await Promise.all(workers);

  return {
    total,
    berhasil,
    gagal,
    durasiMs: Date.now() - mulai,
    isWarm: frameCache.size >= Math.floor(total * 0.7),
  };
}

