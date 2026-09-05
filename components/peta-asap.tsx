"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/assets/vendor/maplibre/maplibre-gl-worker.mjs");
}

import { inferPulau, PROVINSI_KE_PULAU } from "@/lib/wilayah";
import { PUSAT_WILAYAH } from "@/lib/pusat-wilayah";
import type { ZarrTimestepMeta, ZarrMetadataResponse } from "@/lib/zarr-reader";
import type { Berita } from "@/lib/events";

type Props = {
  jumlahLaporan: Record<string, number>;
  onPilihWilayah: (nama: string, pulau: string | null, asal: { x: number; y: number }) => void;
  berita?: Berita[];
  onBukaRincian?: (b: Berita) => void;
  aktif?: boolean;
  onSyncChange?: (syncing: boolean) => void;
};

// GLSL Vertex Shader: Quad koordinat Mercator dunia [0, 1] dikalikan matriks proyeksi MapLibre GL
const VS_SOURCE = `
  attribute vec2 a_pos;
  uniform mat4 u_matrix;
  varying vec2 v_pos;
  void main() {
    v_pos = a_pos;
    gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
  }
`;

// GLSL Fragment Shader: CAMS Global Zarr omaod550 (900 x 451) 60 FPS Scalar Morphing
// Kalibrasi persis sesuai pilihan Anda di Copernicus Fire Emissions Watch:
// - Plot range: [0.00, 1.80]
// - Opacity: 80% (0.80)
// - Fade-in: 25% (0.25)
const FS_SOURCE = `
  precision highp float;
  uniform sampler2D u_texA;
  uniform sampler2D u_texB;
  uniform float u_mix;
  uniform int u_style; // 0: copernicus/fire_smoke, 1: sh_Oranges_aod, 2: sh_all_aod
  varying vec2 v_pos;

  const vec2 u_plotRange = vec2(0.00, 1.80);
  const float u_opacity = 0.80;
  const float u_fadeIn = 0.25;
  const float PI = 3.141592653589793;

  // Palet Sebaran Asap Resmi Copernicus Fire Emissions Watch (RdPu: Milky Haze -> Pink -> Magenta -> Ungu Pekat)
  vec3 getFireSmokeColor(float norm) {
    vec3 c0 = vec3(1.000, 0.969, 0.953); // #FFF7F3 (Kabut tipis atmosferik)
    vec3 c1 = vec3(0.992, 0.881, 0.869); // #FDE1DE (Kabut asap ringan)
    vec3 c2 = vec3(0.989, 0.782, 0.763); // #FCC7C3 (Asap peach-pink)
    vec3 c3 = vec3(0.981, 0.640, 0.715); // #FAA3B6 (Asap rose sedang)
    vec3 c4 = vec3(0.971, 0.445, 0.645); // #F872A4 (Magenta menyala)
    vec3 c5 = vec3(0.887, 0.245, 0.600); // #E23E99 (Magenta pekat)
    vec3 c6 = vec3(0.724, 0.049, 0.516); // #B90D84 (Ungu kemerahan / deep purple-red)
    vec3 c7 = vec3(0.569, 0.004, 0.479); // #91017A (Ungu pekat / plum violet)
    vec3 c8 = vec3(0.407, 0.003, 0.448); // #680172 (Ungu tua)
    vec3 c9 = vec3(0.286, 0.000, 0.416); // #49006A (Pusat asap terpekat / dark scorched violet)

    if (norm < 0.12) {
      return mix(c0, c1, norm / 0.12);
    } else if (norm < 0.24) {
      return mix(c1, c2, (norm - 0.12) / 0.12);
    } else if (norm < 0.36) {
      return mix(c2, c3, (norm - 0.24) / 0.12);
    } else if (norm < 0.48) {
      return mix(c3, c4, (norm - 0.36) / 0.12);
    } else if (norm < 0.60) {
      return mix(c4, c5, (norm - 0.48) / 0.12);
    } else if (norm < 0.72) {
      return mix(c5, c6, (norm - 0.60) / 0.12);
    } else if (norm < 0.82) {
      return mix(c6, c7, (norm - 0.72) / 0.10);
    } else if (norm < 0.92) {
      return mix(c7, c8, (norm - 0.82) / 0.10);
    } else {
      return mix(c8, c9, clamp((norm - 0.92) / 0.08, 0.0, 1.0));
    }
  }

  // Palet Api & Bara (Monokromatik Hangat ECMWF)
  vec3 getOrangesColor(float norm) {
    vec3 c0 = vec3(1.0, 0.95, 0.88);
    vec3 c1 = vec3(1.0, 0.65, 0.15);
    vec3 c2 = vec3(0.96, 0.49, 0.00);
    vec3 c3 = vec3(0.90, 0.32, 0.00);
    vec3 c4 = vec3(0.75, 0.21, 0.05);

    if (norm < 0.22) return mix(c0, c1, norm / 0.22);
    else if (norm < 0.45) return mix(c1, c2, (norm - 0.22) / 0.23);
    else if (norm < 0.70) return mix(c2, c3, (norm - 0.45) / 0.25);
    else return mix(c3, c4, clamp((norm - 0.70) / 0.30, 0.0, 1.0));
  }

  // Palet Spektrum Pelangi Multi-Warna
  vec3 getSpectralColor(float norm) {
    vec3 c0 = vec3(0.0, 0.3, 1.0);
    vec3 c1 = vec3(0.0, 0.9, 0.9);
    vec3 c2 = vec3(0.1, 0.85, 0.1);
    vec3 c3 = vec3(1.0, 0.9, 0.0);
    vec3 c4 = vec3(1.0, 0.2, 0.0);
    vec3 c5 = vec3(0.5, 0.0, 0.1);

    if (norm < 0.18) return mix(c0, c1, norm / 0.18);
    else if (norm < 0.36) return mix(c1, c2, (norm - 0.18) / 0.18);
    else if (norm < 0.55) return mix(c2, c3, (norm - 0.36) / 0.19);
    else if (norm < 0.75) return mix(c3, c4, (norm - 0.55) / 0.20);
    else return mix(c4, c5, clamp((norm - 0.75) / 0.25, 0.0, 1.0));
  }

  void main() {
    float mercX = fract(v_pos.x);
    float mercY = v_pos.y;

    if (mercY < 0.0 || mercY > 1.0) {
      discard;
    }

    // Konversi Mercator y ke Latitude derajat (-85.0511 s.d. +85.0511)
    float lat = degrees(2.0 * atan(exp(PI * (1.0 - 2.0 * mercY))) - PI * 0.5);

    // Koordinat tekstur global (900 kolom x 451 baris):
    // u = Lon [-180 s.d. +180] -> [0 s.d. 1]
    // v = Lat [-90 s.d. +90] -> [0 s.d. 1] (row 0 = -90°S Kutub Selatan, row 450 = +90°N Kutub Utara)
    float u = mercX;
    float v = clamp((lat + 90.0) / 180.0, 0.0, 1.0);

    // Sampling tekstur 900x451 dengan hardware bilinear filtering
    float aodA = texture2D(u_texA, vec2(u, v)).r * 2.0;
    float aodB = texture2D(u_texB, vec2(u, v)).r * 2.0;
    float aod = mix(aodA, aodB, u_mix);

    // Normalisasi terhadap Plot range [0.00, 1.80]
    float norm = clamp((aod - u_plotRange.x) / (u_plotRange.y - u_plotRange.x), 0.0, 1.0);

    // Fade-in 25%: kurva kelembutan kabut asap atmosferik alami persis seperti Copernicus
    float alpha = 1.0;
    if (u_fadeIn > 0.0) {
      alpha = smoothstep(0.0, u_fadeIn, norm);
    }

    // Terapkan Opacity 80%
    alpha *= u_opacity;

    if (alpha < 0.005) {
      discard;
    }

    vec3 rgb;
    if (u_style == 0) {
      rgb = getFireSmokeColor(norm);
    } else if (u_style == 1) {
      rgb = getOrangesColor(norm);
    } else {
      rgb = getSpectralColor(norm);
    }

    // Premultiplied alpha output untuk compositing WebGL MapLibre
    gl_FragColor = vec4(rgb * alpha, alpha);
  }
`;

// Helper daftar waktu bawaan saat API belum merespons
function buatLinimasaDefault(): ZarrTimestepMeta[] {
  const sekarang = Date.now();
  const namaBulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
  const hasil: ZarrTimestepMeta[] = [];

  for (let i = 0; i < 25; i++) {
    const d = new Date(sekarang + i * 3 * 3600 * 1000);
    const iso = d.toISOString().replace(/\.\d{3}Z$/, "Z");
    const waktu = d.getTime();
    const tglUtc = d.getUTCDate();
    const blnUtc = namaBulan[d.getUTCMonth()];
    const jamUtc = String(d.getUTCHours()).padStart(2, "0");
    const menitUtc = String(d.getUTCMinutes()).padStart(2, "0");

    const wib = new Date(waktu + 7 * 3600 * 1000);
    const tglWib = wib.getUTCDate();
    const blnWib = namaBulan[wib.getUTCMonth()];
    const jamWib = String(wib.getUTCHours()).padStart(2, "0");
    const menitWib = String(wib.getUTCMinutes()).padStart(2, "0");

    hasil.push({
      index: i,
      timeChunk: 116,
      timeInner: 0,
      step: i * 3,
      iso,
      waktu,
      labelUtc: `${tglUtc} ${blnUtc}, ${jamUtc}:${menitUtc} UTC`,
      labelWib: `${tglWib} ${blnWib}, ${jamWib}:${menitWib} WIB`,
      adalahPrediksi: i > 0,
    });
  }
  return hasil;
}

function formatIsoKeWib(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const namaBulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
    const wib = new Date(d.getTime() + 7 * 3600 * 1000);
    const tgl = wib.getUTCDate();
    const bln = namaBulan[wib.getUTCMonth()];
    const jam = String(wib.getUTCHours()).padStart(2, "0");
    const menit = String(wib.getUTCMinutes()).padStart(2, "0");
    return `${tgl} ${bln}, ${jam}:${menit} WIB`;
  } catch {
    return "";
  }
}

// Posisi & zoom peta adaptif untuk perangkat mobile potret vs desktop/tablet
function getInitialMapPos(): { center: [number, number]; zoom: number } {
  const isMobilePortrait =
    typeof window !== "undefined" &&
    window.innerWidth < 640 &&
    window.innerHeight > window.innerWidth;
  if (isMobilePortrait) {
    return {
      center: [118.0, -1.0],
      zoom: 3.2,
    };
  }
  return {
    center: [118.0, 0.2],
    zoom: 4,
  };
}

const SINKRON_SELESAI_KEY = "cams_sebaran_asap_selesai";
const METADATA_CACHE_KEY = "cams_sebaran_asap_metadata";

function cekSelesaiSesi(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SINKRON_SELESAI_KEY) === "true";
  } catch {
    return false;
  }
}

function ambilMetadataSesi(): ZarrMetadataResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(METADATA_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Modul-level cache agar frame & metadata bertahan saat navigasi antar-halaman
let globalZarrMetadata: ZarrMetadataResponse | null = null;
const globalFrameCache: Record<string, Uint8Array> = {};
let globalSyncSelesai = false;

export function PetaAsap({ jumlahLaporan, onPilihWilayah, berita, onBukaRincian, aktif = true, onSyncChange }: Props) {
  const wadahPetaRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onPilihRef = useRef(onPilihWilayah);
  const onBukaRincianRef = useRef(onBukaRincian);
  const beritaRef = useRef(berita);
  const jumlahLaporanRef = useRef(jumlahLaporan);
  const tooltipElRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onBukaRincianRef.current = onBukaRincian;
  }, [onBukaRincian]);

  useEffect(() => {
    beritaRef.current = berita;
  }, [berita]);

  useEffect(() => {
    jumlahLaporanRef.current = jumlahLaporan;
  }, [jumlahLaporan]);

  // Status linimasa
  const [linimasa, setLinimasa] = useState<ZarrTimestepMeta[]>(() => {
    if (globalZarrMetadata?.timesteps?.length) return globalZarrMetadata.timesteps;
    const sesi = ambilMetadataSesi();
    if (sesi?.timesteps?.length) {
      globalZarrMetadata = sesi;
      return sesi.timesteps;
    }
    return buatLinimasaDefault();
  });
  const [modelRunWib, setModelRunWib] = useState<string>(() => {
    if (globalZarrMetadata?.latestModelRunWib) return globalZarrMetadata.latestModelRunWib;
    if (globalZarrMetadata?.latestModelRunIso) return formatIsoKeWib(globalZarrMetadata.latestModelRunIso);
    const sesi = ambilMetadataSesi();
    if (sesi?.latestModelRunWib) return sesi.latestModelRunWib;
    if (sesi?.latestModelRunIso) return formatIsoKeWib(sesi.latestModelRunIso);
    return "";
  });
  const [indeksAktif, setIndeksAktif] = useState(0);
  const [memutar, setMemutar] = useState(true);
  const [kecepatan, setKecepatan] = useState<1 | 2>(1);
  const [jumlahFrameTerunduh, setJumlahFrameTerunduh] = useState(() => Object.keys(globalFrameCache).length);
  const [gayaVisual, setGayaVisual] = useState<"copernicus" | "sh_Oranges_aod" | "sh_all_aod">("copernicus");
  const [legendaTerbuka, setLegendaTerbuka] = useState(false);

  // Status sinkronisasi data sebaran asap (Fullscreen Blocking Overlay)
  // Bila data sudah lengkap di memori atau sesi sebelumnya, jangan tampilkan overlay blocking
  const [sedangSync, setSedangSync] = useState(() => {
    if (globalSyncSelesai) return false;
    return !cekSelesaiSesi();
  });
  const [progresSync, setProgresSync] = useState(() => (globalSyncSelesai || cekSelesaiSesi() ? 100 : 5));
  const [galatSync, setGalatSync] = useState<string | null>(null);
  const [waktuTungguLama, setWaktuTungguLama] = useState(false);
  const syncRunningRef = useRef(false);
  const inFlightRequestsRef = useRef<Map<string, Promise<Uint8Array | null>>>(new Map());

  // Beritahu komponen induk jika ada perubahan status sinkronisasi
  useEffect(() => {
    onSyncChange?.(sedangSync);
  }, [sedangSync, onSyncChange]);

  // Pantau durasi tunggu agar pengguna dapat melewati jika koneksi lambat
  useEffect(() => {
    if (!sedangSync) return;
    const timer = setTimeout(() => {
      setWaktuTungguLama(true);
    }, 10000);
    return () => {
      clearTimeout(timer);
    };
  }, [sedangSync]);

  // WebGL references
  const glProgramRef = useRef<WebGLProgram | null>(null);
  const quadBufferRef = useRef<WebGLBuffer | null>(null);
  const aPosLocRef = useRef<number>(-1);
  const uMatrixLocRef = useRef<WebGLUniformLocation | null>(null);
  const texARef = useRef<WebGLTexture | null>(null);
  const texBRef = useRef<WebGLTexture | null>(null);
  const initializedTexturesRef = useRef<Set<WebGLTexture>>(new Set());
  const uTexALocRef = useRef<WebGLUniformLocation | null>(null);
  const uTexBLocRef = useRef<WebGLUniformLocation | null>(null);
  const uMixLocRef = useRef<WebGLUniformLocation | null>(null);
  const uStyleLocRef = useRef<WebGLUniformLocation | null>(null);

  const currentTexAKeyRef = useRef<string>("");
  const currentTexBKeyRef = useRef<string>("");
  const currentMixValRef = useRef<number>(0);

  // Cache buffer biner Uint8Array (405,900 bytes per frame global 900x451)
  const frameCacheRef = useRef<Record<string, Uint8Array>>(globalFrameCache);

  // Animation loop timing
  const progressRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const sliderInputRef = useRef<HTMLInputElement | null>(null);
  const isScrubbingRef = useRef<boolean>(false);

  // State refs for 60 FPS animation loop
  const memutarRef = useRef(memutar);
  const kecepatanRef = useRef(kecepatan);
  const aktifRef = useRef(aktif);
  const gayaVisualRef = useRef(gayaVisual);
  const linimasaRef = useRef(linimasa);

  const angkaMarkersRef = useRef<
    Array<{
      marker: maplibregl.Marker;
      el: HTMLElement;
      titik: [number, number];
      kotak: [number, number, number, number];
    }>
  >([]);
  const renderAngkaRef = useRef<(() => void) | null>(null);
  const muatFrameRef = useRef<((stepMeta: ZarrTimestepMeta) => Promise<Uint8Array | null>) | null>(null);

  useEffect(() => {
    memutarRef.current = memutar;
  }, [memutar]);

  useEffect(() => {
    kecepatanRef.current = kecepatan;
  }, [kecepatan]);

  useEffect(() => {
    aktifRef.current = aktif;
    if (aktif) {
      if (mapRef.current) {
        mapRef.current.resize();
      }
      // Jika proses sync masih berlangsung saat beralih kembali ke tab Sebaran Asap, pastikan overlay muncul
      if (syncRunningRef.current) {
        setSedangSync(true);
      }
    }
  }, [aktif]);

  useEffect(() => {
    gayaVisualRef.current = gayaVisual;
    if (mapRef.current) {
      mapRef.current.triggerRepaint();
    }
  }, [gayaVisual]);

  useEffect(() => {
    linimasaRef.current = linimasa;
  }, [linimasa]);

  useEffect(() => {
    onPilihRef.current = onPilihWilayah;
  }, [onPilihWilayah]);

  // Upload data buffer ke tekstur WebGL (900 cols x 451 rows) dengan hardware bilinear interpolation
  const uploadTextureBuffer = useCallback(
    (gl: WebGLRenderingContext | WebGL2RenderingContext, tex: WebGLTexture, buffer: Uint8Array, unit: number) => {
      gl.activeTexture(unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      if (!initializedTexturesRef.current.has(tex)) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.LUMINANCE,
          900,
          451,
          0,
          gl.LUMINANCE,
          gl.UNSIGNED_BYTE,
          buffer
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        initializedTexturesRef.current.add(tex);
      } else {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          900,
          451,
          gl.LUMINANCE,
          gl.UNSIGNED_BYTE,
          buffer
        );
      }
    },
    []
  );

  // Unduh frame biner Zarr individual
  const muatFrame = useCallback(async (stepMeta: ZarrTimestepMeta): Promise<Uint8Array | null> => {
    const key = `${stepMeta.timeChunk}_${stepMeta.step}_${stepMeta.timeInner}`;
    if (frameCacheRef.current[key]) {
      return frameCacheRef.current[key];
    }
    if (globalFrameCache[key]) {
      frameCacheRef.current[key] = globalFrameCache[key];
      return globalFrameCache[key];
    }
    const ongoing = inFlightRequestsRef.current.get(key);
    if (ongoing) {
      return ongoing;
    }

    const promise = (async () => {
      try {
        const res = await fetch(
          `/api/sebaran-asap?mode=frame&timeChunk=${stepMeta.timeChunk}&step=${stepMeta.step}&timeInner=${stepMeta.timeInner}`
        );
        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        const u8 = new Uint8Array(arrayBuf);
        globalFrameCache[key] = u8;
        frameCacheRef.current[key] = u8;
        setJumlahFrameTerunduh((prev) => prev + 1);
        if (mapRef.current) {
          mapRef.current.triggerRepaint();
        }
        return u8;
      } catch (e) {
        console.error("[PetaAsap] Gagal mengunduh frame:", stepMeta, e);
        return null;
      } finally {
        inFlightRequestsRef.current.delete(key);
      }
    })();

    inFlightRequestsRef.current.set(key, promise);
    return promise;
  }, []);

  useEffect(() => {
    muatFrameRef.current = muatFrame;
  }, [muatFrame]);

  // Sinkronisasi data sebaran asap: memuat metadata dan frame linimasa
  const sinkronkanSebaranAsap = useCallback(
    async (paksaRefresh = false) => {
      if (paksaRefresh) {
        setGalatSync(null);
        setWaktuTungguLama(false);
        setSedangSync(true);
        setProgresSync(5);
        globalSyncSelesai = false;
        globalZarrMetadata = null;
        for (const k of Object.keys(globalFrameCache)) {
          delete globalFrameCache[k];
        }
        try {
          sessionStorage.removeItem(SINKRON_SELESAI_KEY);
          sessionStorage.removeItem(METADATA_CACHE_KEY);
        } catch {}
        frameCacheRef.current = globalFrameCache;
        setJumlahFrameTerunduh(0);
      } else {
        // Jika data sudah pernah tersinkronisasi di sesi browser atau di memori modul
        const sudahSelesai = globalSyncSelesai || cekSelesaiSesi();
        const cachedMeta = globalZarrMetadata || ambilMetadataSesi();
        if (sudahSelesai && cachedMeta?.timesteps?.length) {
          globalSyncSelesai = true;
          globalZarrMetadata = cachedMeta;
          const runWib = cachedMeta.latestModelRunWib || (cachedMeta.latestModelRunIso ? formatIsoKeWib(cachedMeta.latestModelRunIso) : "");
          if (runWib) setModelRunWib(runWib);
          setLinimasa(cachedMeta.timesteps);
          setSedangSync(false);
          setProgresSync(100);

          // Muat frame aktif jika belum ada di memori WebGL
          const activeIndex = Math.min(Math.floor(progressRef.current), cachedMeta.timesteps.length - 1);
          const activeStep = cachedMeta.timesteps[activeIndex] || cachedMeta.timesteps[0];
          if (activeStep) {
            await muatFrame(activeStep);
            if (mapRef.current) {
              mapRef.current.triggerRepaint();
            }
          }

          // Unduh frame sisa di latar belakang secara hening tanpa memunculkan popup blocking
          const totalFrames = cachedMeta.timesteps.length;
          let nextIndex = 0;
          const CONCURRENCY = 4;
          const workerBg = async () => {
            while (nextIndex < totalFrames) {
              const cur = nextIndex++;
              const step = cachedMeta.timesteps[cur];
              if (step) {
                const k = `${step.timeChunk}_${step.step}_${step.timeInner}`;
                if (!frameCacheRef.current[k]) {
                  await muatFrame(step);
                }
              }
            }
          };
          Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalFrames) }, () => workerBg())).catch(() => {});

          // Revalidasi hening di latar belakang (Stale-While-Revalidate):
          // Cek apakah server sudah memiliki siklus model CAMS yang lebih baru
          const revalidasiLatarBelakang = async () => {
            try {
              const res = await fetch(`/api/sebaran-asap?mode=metadata&_ts=${Date.now()}`);
              if (!res.ok) return;
              const metaBaru: ZarrMetadataResponse = await res.json();
              if (!metaBaru.timesteps || metaBaru.timesteps.length === 0) return;

              const runLama = cachedMeta.latestModelRunIso;
              const runBaru = metaBaru.latestModelRunIso;

              if (runBaru && runBaru !== runLama) {
                globalZarrMetadata = metaBaru;
                try {
                  sessionStorage.setItem(SINKRON_SELESAI_KEY, "true");
                  sessionStorage.setItem(METADATA_CACHE_KEY, JSON.stringify(metaBaru));
                } catch {}

                const runWibBaru =
                  metaBaru.latestModelRunWib ||
                  (metaBaru.latestModelRunIso ? formatIsoKeWib(metaBaru.latestModelRunIso) : "");
                if (runWibBaru) setModelRunWib(runWibBaru);
                setLinimasa(metaBaru.timesteps);

                // Muat frame aktif untuk siklus model baru
                const curActiveIndex = Math.min(
                  Math.floor(progressRef.current),
                  metaBaru.timesteps.length - 1
                );
                const curStep = metaBaru.timesteps[curActiveIndex] || metaBaru.timesteps[0];
                if (curStep) {
                  await muatFrame(curStep);
                  if (mapRef.current) {
                    mapRef.current.triggerRepaint();
                  }
                }

                // Unduh frame baru sisa di latar belakang
                const totalNew = metaBaru.timesteps.length;
                let nextNewIdx = 0;
                const workerNew = async () => {
                  while (nextNewIdx < totalNew) {
                    const idx = nextNewIdx++;
                    const st = metaBaru.timesteps[idx];
                    if (st) {
                      const k = `${st.timeChunk}_${st.step}_${st.timeInner}`;
                      if (!frameCacheRef.current[k]) {
                        await muatFrame(st);
                      }
                    }
                  }
                };
                Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalNew) }, () => workerNew())).catch(
                  () => {}
                );
              }
            } catch {
              // Hening jika gagal revalidasi latar belakang agar UX tidak terganggu
            }
          };
          revalidasiLatarBelakang();

          return;
        }
      }
      syncRunningRef.current = true;

      try {
        const url = paksaRefresh
          ? `/api/sebaran-asap?mode=metadata&_ts=${Date.now()}`
          : "/api/sebaran-asap?mode=metadata";

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Gagal memuat metadata satelit (${res.status})`);
        }

        const data: ZarrMetadataResponse = await res.json();
        if (!data.timesteps || data.timesteps.length === 0) {
          throw new Error("Data linimasa sebaran asap tidak tersedia");
        }

        const totalFrames = data.timesteps.length;
        globalZarrMetadata = data;
        const runWib = data.latestModelRunWib || (data.latestModelRunIso ? formatIsoKeWib(data.latestModelRunIso) : "");
        if (runWib) setModelRunWib(runWib);
        setLinimasa(data.timesteps);

        // Muat frame aktif awal agar shader WebGL langsung terisi tanpa jeda
        const activeIndex = Math.min(Math.floor(progressRef.current), totalFrames - 1);
        const activeStep = data.timesteps[activeIndex] || data.timesteps[0];
        if (activeStep) {
          await muatFrame(activeStep);
          if (mapRef.current) {
            mapRef.current.triggerRepaint();
          }
        }

        // Unduh seluruh frame secara paralel sambil mengabari progres modal sync
        let selesai = 0;
        let nextIndex = 0;
        const CONCURRENCY = 5;

        const worker = async () => {
          while (nextIndex < totalFrames) {
            const currentIndex = nextIndex++;
            const stepMeta = data.timesteps[currentIndex];
            if (stepMeta) {
              await muatFrame(stepMeta);
              selesai++;
              const persen = Math.min(99, Math.round((selesai / totalFrames) * 100));
              setProgresSync(persen);
            }
          }
        };

        const workers = Array.from(
          { length: Math.min(CONCURRENCY, totalFrames) },
          () => worker()
        );
        await Promise.all(workers);

        globalSyncSelesai = true;
        try {
          sessionStorage.setItem(SINKRON_SELESAI_KEY, "true");
          sessionStorage.setItem(METADATA_CACHE_KEY, JSON.stringify(data));
        } catch {}

        setProgresSync(100);

        setTimeout(() => {
          setSedangSync(false);
          setWaktuTungguLama(false);
          syncRunningRef.current = false;
          if (mapRef.current) {
            mapRef.current.triggerRepaint();
          }
        }, 200);
      } catch (err) {
        console.error("[PetaAsap] Gagal sinkronisasi sebaran asap:", err);
        setGalatSync(
          err instanceof Error ? err.message : "Gagal menyinkronkan sebaran asap"
        );
        setSedangSync(true);
        syncRunningRef.current = false;
      }
    },
    [muatFrame]
  );

  // Jalankan sinkronisasi saat komponen terpasang, saat window kembali aktif (focus), dan berkala tiap 10 menit
  useEffect(() => {
    let batal = false;
    const t = setTimeout(() => {
      if (!batal) sinkronkanSebaranAsap(false);
    }, 0);

    const onFocus = () => {
      if (!batal) sinkronkanSebaranAsap(false);
    };
    window.addEventListener("focus", onFocus);

    const interval = setInterval(() => {
      if (!batal && typeof document !== "undefined" && !document.hidden) {
        sinkronkanSebaranAsap(false);
      }
    }, 10 * 60 * 1000);

    return () => {
      batal = true;
      clearTimeout(t);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [sinkronkanSebaranAsap]);

  // Inisialisasi MapLibre GL & Custom WebGL Layer
  useEffect(() => {
    if (!wadahPetaRef.current || mapRef.current) return;

    // Konfigurasi Style MapLibre GL
    const mapStyle: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        "satellite-tiles": {
          type: "raster",
          tiles: [
            "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpeg",
          ],
          tileSize: 256,
          attribution: "Sentinel-2 cloudless by EOX IT Services GmbH",
          maxzoom: 14,
        },
      },
      layers: [
        {
          id: "background",
          type: "background",
          paint: {
            "background-color": "#070c14",
          },
        },
        {
          id: "satellite-layer",
          type: "raster",
          source: "satellite-tiles",
          paint: {
            "raster-opacity": 1.0,
            "raster-brightness-max": 0.85,
            "raster-contrast": 0.15,
            "raster-saturation": -0.1,
          },
        },
      ],
    };

    // Inisialisasi Peta MapLibre GL (Pusat Indonesia, adaptif mobile potret vs desktop)
    const initialPos = getInitialMapPos();
    const map = new maplibregl.Map({
      container: wadahPetaRef.current,
      style: mapStyle,
      center: initialPos.center,
      zoom: initialPos.zoom,
      minZoom: 2.5,
      maxZoom: 12,
      pitch: 0,
      maxPitch: 0,
      bearing: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
      scrollZoom: false, // Diteruskan manual untuk kelembutan sinkronisasi Lenis
    });

    mapRef.current = map;
    (window as unknown as { _maplibreMap?: maplibregl.Map })._maplibreMap = map;

    // Custom WebGL Layer untuk Asap Karhutla CAMS Global
    const smokeCustomLayer: maplibregl.CustomLayerInterface = {
      id: "smoke-layer",
      type: "custom",
      renderingMode: "2d",

      onAdd(_map: maplibregl.Map, gl: WebGL2RenderingContext) {
        const createShader = (type: number, src: string) => {
          const s = gl.createShader(type);
          if (!s) return null;
          gl.shaderSource(s, src);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error("[MapLibre Smoke] Shader compile error:", gl.getShaderInfoLog(s));
            gl.deleteShader(s);
            return null;
          }
          return s;
        };

        const vs = createShader(gl.VERTEX_SHADER, VS_SOURCE);
        const fs = createShader(gl.FRAGMENT_SHADER, FS_SOURCE);
        if (!vs || !fs) return;

        const prog = gl.createProgram();
        if (!prog) return;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          console.error("[MapLibre Smoke] Program link error:", gl.getProgramInfoLog(prog));
          return;
        }
        glProgramRef.current = prog;

        // Quad mencakup Mercator global: World 0, World -1 (Barat), World +1 (Timur)
        // Mercator x in [0, 1], y in [0, 1]
        const quadData = new Float32Array([
          // World 0 (Pusat & Indonesia)
          0, 0,
          1, 0,
          0, 1,
          0, 1,
          1, 0,
          1, 1,

          // World -1 (Salinan Barat)
          -1, 0,
          0, 0,
          -1, 1,
          -1, 1,
          0, 0,
          0, 1,

          // World +1 (Salinan Timur)
          1, 0,
          2, 0,
          1, 1,
          1, 1,
          2, 0,
          2, 1,
        ]);

        const quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);
        quadBufferRef.current = quadBuffer;

        aPosLocRef.current = gl.getAttribLocation(prog, "a_pos");
        uMatrixLocRef.current = gl.getUniformLocation(prog, "u_matrix");
        uTexALocRef.current = gl.getUniformLocation(prog, "u_texA");
        uTexBLocRef.current = gl.getUniformLocation(prog, "u_texB");
        uMixLocRef.current = gl.getUniformLocation(prog, "u_mix");
        uStyleLocRef.current = gl.getUniformLocation(prog, "u_style");

        // Buat tekstur A dan B (900 x 451 single-channel)
        const createTex = () => {
          const t = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.LUMINANCE,
            900,
            451,
            0,
            gl.LUMINANCE,
            gl.UNSIGNED_BYTE,
            new Uint8Array(900 * 451)
          );
          return t;
        };

        texARef.current = createTex();
        texBRef.current = createTex();
      },

      render(gl: WebGL2RenderingContext, options: maplibregl.CustomRenderMethodInput) {
        const prog = glProgramRef.current;
        const quadBuffer = quadBufferRef.current;
        const aPos = aPosLocRef.current;
        const texA = texARef.current;
        const texB = texBRef.current;

        if (!prog || !quadBuffer || aPos < 0 || !texA || !texB) return;

        const matrix = options.defaultProjectionData?.mainMatrix || options.modelViewProjectionMatrix;
        if (!matrix) return;

        // Upload tekstur jika data frame siap & belum di-upload
        const activeLinimasa = linimasaRef.current;
        const totalFrames = activeLinimasa.length;
        if (totalFrames > 0) {
          const progVal = progressRef.current;
          const idxA = Math.floor(progVal) % totalFrames;
          const idxB = (idxA + 1) % totalFrames;
          const metaA = activeLinimasa[idxA];
          const metaB = activeLinimasa[idxB];
          const keyA = metaA ? `${metaA.timeChunk}_${metaA.step}_${metaA.timeInner}` : "";
          const keyB = metaB ? `${metaB.timeChunk}_${metaB.step}_${metaB.timeInner}` : "";
          const bufA = keyA ? frameCacheRef.current[keyA] : null;
          const bufB = keyB ? frameCacheRef.current[keyB] : null;
          const fallbackBuf = Object.values(frameCacheRef.current)[0];

          const targetA = bufA || fallbackBuf;
          const targetKeyA = bufA ? keyA : fallbackBuf ? "fallback" : "";
          if (targetA && currentTexAKeyRef.current !== targetKeyA) {
            uploadTextureBuffer(gl, texA, targetA, gl.TEXTURE0);
            currentTexAKeyRef.current = targetKeyA;
          }

          const targetB = bufB || targetA;
          const targetKeyB = bufB ? keyB : targetKeyA;
          if (targetB && currentTexBKeyRef.current !== targetKeyB) {
            uploadTextureBuffer(gl, texB, targetB, gl.TEXTURE1);
            currentTexBKeyRef.current = targetKeyB;
          }
        }

        gl.useProgram(prog);

        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        if (uMatrixLocRef.current) {
          gl.uniformMatrix4fv(uMatrixLocRef.current, false, matrix);
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texA);
        if (uTexALocRef.current) gl.uniform1i(uTexALocRef.current, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texB);
        if (uTexBLocRef.current) gl.uniform1i(uTexBLocRef.current, 1);

        if (uMixLocRef.current) {
          gl.uniform1f(uMixLocRef.current, currentMixValRef.current);
        }

        if (uStyleLocRef.current) {
          const styleCode =
            gayaVisualRef.current === "copernicus" ? 0 : gayaVisualRef.current === "sh_Oranges_aod" ? 1 : 2;
          gl.uniform1i(uStyleLocRef.current, styleCode);
        }

        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.drawArrays(gl.TRIANGLES, 0, 18);

        // Bersihkan state WebGL agar MapLibre GL dapat merender layer vektor & GeoJSON dengan stabil
        gl.disableVertexAttribArray(aPos);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.useProgram(null);
      },

      onRemove(_map: maplibregl.Map, gl: WebGL2RenderingContext) {
        if (texARef.current) gl.deleteTexture(texARef.current);
        if (texBRef.current) gl.deleteTexture(texBRef.current);
        if (quadBufferRef.current) gl.deleteBuffer(quadBufferRef.current);
        if (glProgramRef.current) gl.deleteProgram(glProgramRef.current);
        initializedTexturesRef.current.clear();
      },
    };

    map.on("load", () => {
      // 1. Tambahkan Custom Layer Asap di atas Satelit & WMS Simontini
      map.addLayer(smokeCustomLayer);

      // 2. Tambahkan Batas Wilayah Provinsi GeoJSON di atas Asap (transparan persis seperti Kualitas Udara)
      map.addSource("batas-provinsi", {
        type: "geojson",
        data: "/data/peta-provinsi.json",
        generateId: true,
      });

      map.addLayer({
        id: "batas-provinsi-fill",
        type: "fill",
        source: "batas-provinsi",
        paint: {
          "fill-color": "#ffffff",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.20,
            0.04,
          ],
        },
      });

      map.addLayer({
        id: "batas-provinsi-garis",
        type: "line",
        source: "batas-provinsi",
        paint: {
          "line-color": "rgba(255, 255, 255, 0.70)",
          "line-width": 1.5,
        },
      });

      let hoveredId: string | number | null = null;

      map.on("mousemove", "batas-provinsi-fill", (e) => {
        if (e.features && e.features.length > 0) {
          if (hoveredId !== null) {
            map.setFeatureState(
              { source: "batas-provinsi", id: hoveredId },
              { hover: false }
            );
          }
          const feat = e.features[0];
          hoveredId = feat.id ?? null;
          if (hoveredId !== null) {
            map.setFeatureState(
              { source: "batas-provinsi", id: hoveredId },
              { hover: true }
            );
          }
          map.getCanvas().style.cursor = "pointer";

          const nama = feat.properties?.nama as string;
          if (nama && tooltipElRef.current) {
            const jml = jumlahLaporanRef.current[nama];
            const teksJml =
              typeof jml === "number" && jml > 0
                ? `<span style="color:#ef4444;font-weight:700;">${jml.toLocaleString("id-ID")} laporan karhutla</span>`
                : `<span style="color:rgba(255,255,255,0.65);">Tidak ada laporan karhutla</span>`;
            tooltipElRef.current.innerHTML = `<div style="font-weight:700;color:#f59e0b;margin-bottom:2px;">${nama}</div><div style="font-size:11px;">${teksJml}</div>`;
            tooltipElRef.current.style.display = "block";
            tooltipElRef.current.style.left = `${e.originalEvent.clientX + 14}px`;
            tooltipElRef.current.style.top = `${e.originalEvent.clientY + 14}px`;
          }
        }
      });

      map.on("mouseleave", "batas-provinsi-fill", () => {
        if (hoveredId !== null) {
          map.setFeatureState(
            { source: "batas-provinsi", id: hoveredId },
            { hover: false }
          );
          hoveredId = null;
        }
        map.getCanvas().style.cursor = "";
        if (tooltipElRef.current) {
          tooltipElRef.current.style.display = "none";
        }
      });

      map.on("click", "batas-provinsi-fill", (e) => {
        if (e.features && e.features.length > 0) {
          const feat = e.features[0];
          const nama = feat.properties?.nama as string;
          if (nama) {
            const pulau = PROVINSI_KE_PULAU[nama] || inferPulau(nama) || null;
            const asal = {
              x: e.originalEvent.clientX,
              y: e.originalEvent.clientY,
            };
            if (tooltipElRef.current) {
              tooltipElRef.current.style.display = "none";
            }
            if (onPilihRef.current) {
              onPilihRef.current(nama, pulau, asal);
            }
          }
        }
      });

      // Render angka jumlah kejadian di pusat tiap provinsi (persis desain lama)
      renderAngka();
    });

    const perbaruiAngka = () => {
      const activeMap = mapRef.current;
      if (!activeMap || !angkaMarkersRef.current.length) return;

      const ANGKA_SELA = 12;
      for (const a of angkaMarkersRef.current) {
        a.el.classList.remove("peta-angka--bertumpuk");
      }

      const kotak = angkaMarkersRef.current.map((a, urut) => {
        const isi = a.el.firstElementChild as HTMLElement | null;
        const pusat = activeMap.project(a.titik);
        const d = a.kotak;
        const ka = activeMap.project([d[0], d[3]]);
        const kb = activeMap.project([d[2], d[1]]);
        return {
          urut,
          x: pusat.x,
          y: pusat.y,
          w: (isi ? isi.offsetWidth : 0) + ANGKA_SELA,
          h: (isi ? isi.offsetHeight : 0) + ANGKA_SELA,
          luas: Math.abs(kb.x - ka.x) * Math.abs(kb.y - ka.y),
        };
      });

      kotak.sort((a, b) => b.luas - a.luas);
      const ditempatkan: Array<{ x: number; y: number; w: number; h: number }> = [];
      for (const c of kotak) {
        const bertumpuk = ditempatkan.some(
          (t) => Math.abs(c.x - t.x) * 2 < c.w + t.w && Math.abs(c.y - t.y) * 2 < c.h + t.h
        );
        if (bertumpuk) {
          angkaMarkersRef.current[c.urut].el.classList.add("peta-angka--bertumpuk");
        } else {
          ditempatkan.push(c);
        }
      }
    };

    const renderAngka = () => {
      angkaMarkersRef.current.forEach((item) => item.marker.remove());
      angkaMarkersRef.current = [];

      for (const [nama, info] of Object.entries(PUSAT_WILAYAH)) {
        const jumlah = jumlahLaporanRef.current[nama];
        if (typeof jumlah !== "number") continue;

        const el = document.createElement("div");
        el.className = "peta-angka";
        el.innerHTML = `<span class="peta-angka__nilai" aria-hidden="true">${jumlah.toLocaleString("id-ID")}</span>`;

        const marker = new maplibregl.Marker({
          element: el,
          anchor: "center",
        })
          .setLngLat(info.titik)
          .addTo(map);

        angkaMarkersRef.current.push({
          marker,
          el,
          titik: info.titik,
          kotak: info.kotak,
        });
      }

      setTimeout(perbaruiAngka, 50);
    };

    renderAngkaRef.current = renderAngka;

    map.on("zoomend", perbaruiAngka);
    map.on("moveend", perbaruiAngka);
    map.on("resize", perbaruiAngka);

    // Handler event wheel untuk meneruskan scroll halaman (Lenis)
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) map.zoomIn();
        else map.zoomOut();
        return;
      }
      e.preventDefault();
      const rawDeltaY = e.deltaY * 0.75;
      const lenis = (window as unknown as {
        lenis?: {
          scrollTo: (t: number, opts?: Record<string, unknown>) => void;
          targetScroll?: number;
          scroll: number;
        };
      }).lenis;
      if (lenis && typeof lenis.scrollTo === "function") {
        const current = typeof lenis.targetScroll === "number" ? lenis.targetScroll : lenis.scroll;
        lenis.scrollTo(current + rawDeltaY, { programmatic: false });
      } else {
        window.scrollBy({ top: rawDeltaY, behavior: "auto" });
      }
    };

    const container = wadahPetaRef.current;
    const tooltipEl = tooltipElRef.current;
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      angkaMarkersRef.current.forEach((m) => m.marker.remove());
      angkaMarkersRef.current = [];
      renderAngkaRef.current = null;
      if (tooltipEl) {
        tooltipEl.style.display = "none";
      }
      delete (window as unknown as { _maplibreMap?: maplibregl.Map })._maplibreMap;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Perbarui angka jumlah kejadian di peta saat data jumlahLaporan berubah
  useEffect(() => {
    if (renderAngkaRef.current) {
      renderAngkaRef.current();
    }
  }, [jumlahLaporan]);

  // Loop Rendering Animasi 60 FPS: Siklus 2.0 detik per data step (1.0 detik pada kecepatan 2x)
  useEffect(() => {
    let lastRenderedIndex = -1;

    const renderLoop = (time: number) => {
      if (document.hidden) {
        rafIdRef.current = null;
        return;
      }

      const map = mapRef.current;
      const prog = glProgramRef.current;
      const texA = texARef.current;
      const texB = texBRef.current;
      const activeLinimasa = linimasaRef.current;

      if (map && prog && texA && texB && activeLinimasa.length > 0) {
        const prev = lastTimeRef.current || time;
        const dt = Math.min((time - prev) / 1000, 0.1);
        lastTimeRef.current = time;

        const isPlaying = !!(memutarRef.current && aktifRef.current && !document.hidden);
        const isScrubbing = isScrubbingRef.current;
        const stepDuration = kecepatanRef.current === 2 ? 1.0 : 2.0;
        const totalFrames = activeLinimasa.length;

        if (isPlaying) {
          progressRef.current = (progressRef.current + dt / stepDuration) % totalFrames;
        }

        const progVal = progressRef.current;
        const idxA = Math.floor(progVal) % totalFrames;
        const idxB = (idxA + 1) % totalFrames;
        const idxNext = (idxB + 1) % totalFrames;
        const mixVal = progVal - Math.floor(progVal);
        currentMixValRef.current = mixVal;

        // Prefetch frame aktif & langkah berikutnya secara mulus
        if (muatFrameRef.current) {
          const metaA = activeLinimasa[idxA];
          const metaB = activeLinimasa[idxB];
          const metaNext = activeLinimasa[idxNext];
          if (metaA) {
            const keyA = `${metaA.timeChunk}_${metaA.step}_${metaA.timeInner}`;
            if (!frameCacheRef.current[keyA]) muatFrameRef.current(metaA);
          }
          if (metaB) {
            const keyB = `${metaB.timeChunk}_${metaB.step}_${metaB.timeInner}`;
            if (!frameCacheRef.current[keyB]) muatFrameRef.current(metaB);
          }
          if (metaNext) {
            const keyNext = `${metaNext.timeChunk}_${metaNext.step}_${metaNext.timeInner}`;
            if (!frameCacheRef.current[keyNext]) muatFrameRef.current(metaNext);
          }
        }

        // Picu repaint MapLibre GL pada vsync 60 FPS hanya jika sedang memutar atau scrubbing aktif
        if ((memutarRef.current && aktifRef.current && !document.hidden) || isScrubbing) {
          map.triggerRepaint();
        }

        // Update slider input di DOM
        if (sliderInputRef.current && (isPlaying || isScrubbing)) {
          sliderInputRef.current.value = progVal.toFixed(2);
          const maxStep = Math.max(1, totalFrames - 1);
          const pct = ((progVal / maxStep) * 100).toFixed(1);
          sliderInputRef.current.style.setProperty("--progress-percent", `${pct}%`);
        }

        const roundIdx = Math.floor(progVal) % totalFrames;
        if (roundIdx !== lastRenderedIndex) {
          lastRenderedIndex = roundIdx;
          setIndeksAktif(roundIdx);
        }
      }

      rafIdRef.current = requestAnimationFrame(renderLoop);
    };

    const startLoop = () => {
      if (!rafIdRef.current && !document.hidden) {
        lastTimeRef.current = 0;
        rafIdRef.current = requestAnimationFrame(renderLoop);
      }
    };

    const stopLoop = () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopLoop();
      } else {
        startLoop();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    startLoop();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopLoop();
    };
  }, [uploadTextureBuffer]);

  // Handler scrubbing manual pada slider linimasa (60 FPS interaktif)
  const handlePointerDown = useCallback(() => {
    isScrubbingRef.current = true;
    const onPointerUp = () => {
      isScrubbingRef.current = false;
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }, []);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    progressRef.current = val;
    const totalFrames = linimasaRef.current.length || 1;
    const idx = Math.floor(val) % totalFrames;
    setIndeksAktif(idx);

    const maxStep = Math.max(1, totalFrames - 1);
    const pct = ((val / maxStep) * 100).toFixed(1);
    e.target.style.setProperty("--progress-percent", `${pct}%`);

    if (muatFrameRef.current && linimasaRef.current.length > 0) {
      const metaA = linimasaRef.current[idx];
      const metaB = linimasaRef.current[(idx + 1) % totalFrames];
      if (metaA) muatFrameRef.current(metaA);
      if (metaB) muatFrameRef.current(metaB);
    }

    if (mapRef.current) {
      mapRef.current.triggerRepaint();
    }
  }, []);

  const langkahSekarang = linimasa[indeksAktif];
  const persentaseCache = Math.round((jumlahFrameTerunduh / Math.max(1, linimasa.length)) * 100);

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#070c14]">
      {/* Wadah Peta MapLibre GL */}
      <div ref={wadahPetaRef} className="absolute inset-0 h-full w-full" />

      {/* Tooltip Mengambang Provinsi (Persis Kualitas Udara) */}
      <div
        ref={tooltipElRef}
        id="asap-provinsi-tooltip"
        style={{
          position: "fixed",
          display: "none",
          pointerEvents: "none",
          zIndex: 9999,
          background: "rgba(20, 16, 15, 0.94)",
          border: "1px solid rgba(255, 255, 255, 0.25)",
          color: "#fff",
          borderRadius: "8px",
          padding: "6px 12px",
          fontSize: "12px",
          fontWeight: 600,
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.6)",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      />

      {/* Kontrol Navigasi Peta (Kanan Atas) */}
      <div className="absolute right-3 top-20 z-[400] flex flex-col gap-2 sm:right-4">
        {/* Tombol Zoom In */}
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          aria-label="Perbesar peta"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/75 text-white/90 shadow-lg ring-1 ring-white/15 backdrop-blur-md transition-transform active:scale-90 hover:bg-black hover:text-white"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Tombol Zoom Out */}
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          aria-label="Perkecil peta"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/75 text-white/90 shadow-lg ring-1 ring-white/15 backdrop-blur-md transition-transform active:scale-90 hover:bg-black hover:text-white"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Tombol Reset Posisi Nusantara */}
        <button
          type="button"
          onClick={() => {
            const pos = getInitialMapPos();
            mapRef.current?.flyTo({
              center: pos.center,
              zoom: pos.zoom,
              pitch: 0,
              bearing: 0,
              essential: true,
            });
          }}
          aria-label="Fokus seluruh Nusantara"
          title="Fokus seluruh Nusantara"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/75 text-white/90 shadow-lg ring-1 ring-white/15 backdrop-blur-md transition-transform active:scale-90 hover:bg-black hover:text-white"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>

        {/* Tombol Sinkronkan Sebaran Asap */}
        <button
          type="button"
          onClick={() => sinkronkanSebaranAsap(true)}
          disabled={sedangSync}
          aria-label="Sinkronkan sebaran asap terbaru"
          title="Sinkronkan sebaran asap terbaru"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/75 text-white/90 shadow-lg ring-1 ring-white/15 backdrop-blur-md transition-all active:scale-90 hover:bg-black hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={sedangSync ? "animate-spin text-fuchsia-400" : ""}
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        </button>
      </div>

      {/* Tombol Mini/Chip Legenda untuk Layar Mobile (< xl) */}
      <button
        type="button"
        onClick={() => setLegendaTerbuka(true)}
        className={`pointer-events-auto absolute bottom-24 right-3 z-[400] items-center gap-1.5 rounded-full bg-black/85 px-3 py-1.5 text-xs font-semibold text-white/90 shadow-2xl ring-1 ring-white/15 backdrop-blur-md transition-all active:scale-95 hover:bg-black hover:text-white ${
          legendaTerbuka ? "hidden" : "flex xl:hidden"
        }`}
        aria-label="Buka legenda sebaran asap"
      >
        <span className={`text-sm leading-none ${gayaVisual === "copernicus" ? "text-fuchsia-400" : "text-amber-400"}`}>🔥</span>
        <span>Sebaran Asap</span>
        <span className="text-white/40">·</span>
        <span className={`text-[11px] font-medium ${
          gayaVisual === "copernicus"
            ? "text-fuchsia-400"
            : gayaVisual === "sh_Oranges_aod"
            ? "text-amber-400"
            : "text-sky-400"
        }`}>
          {gayaVisual === "copernicus"
            ? "Fire Watch"
            : gayaVisual === "sh_Oranges_aod"
            ? "Bara"
            : "Spektrum"}
        </span>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="ml-0.5 text-white/60"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Indikator Info Sumber Data & Legenda Warna (Kanan Bawah) */}
      <div
        className={`pointer-events-auto absolute bottom-24 right-3 z-[400] w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-black/85 p-3.5 text-xs text-white/85 shadow-2xl ring-1 ring-white/15 backdrop-blur-md transition-all xl:bottom-4 xl:right-5 ${
          legendaTerbuka ? "block" : "hidden xl:block"
        }`}
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-1.5 font-semibold text-white">
            <span className={gayaVisual === "copernicus" ? "text-fuchsia-400" : "text-amber-400"}>🔥</span>
            <span>Sebaran Asap</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
              Copernicus CAMS
            </span>
            {/* Tombol Tutup Legenda pada Mobile */}
            <button
              type="button"
              onClick={() => setLegendaTerbuka(false)}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors xl:hidden"
              aria-label="Tutup legenda sebaran asap"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-white/70">
          Pantauan partikel aerosol asap akibat kebakaran hutan dan lahan (OMAOD 550nm &bull; Organic Matter AOD).
        </p>

        {/* Pita Gradien Warna */}
        <div className="mt-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] text-white/50 font-medium">
            <span>Tingkat Kepekatan</span>
            <button
              type="button"
              onClick={() =>
                setGayaVisual((prev) =>
                  prev === "copernicus"
                    ? "sh_Oranges_aod"
                    : prev === "sh_Oranges_aod"
                    ? "sh_all_aod"
                    : "copernicus"
                )
              }
              className={`font-medium transition-colors ${
                gayaVisual === "copernicus"
                  ? "text-fuchsia-400 hover:text-fuchsia-300"
                  : gayaVisual === "sh_Oranges_aod"
                  ? "text-amber-400 hover:text-amber-300"
                  : "text-sky-400 hover:text-sky-300"
              }`}
            >
              {gayaVisual === "copernicus"
                ? "Fire Watch"
                : gayaVisual === "sh_Oranges_aod"
                ? "Bara"
                : "Spektrum"}
            </button>
          </div>

          <div
            className="h-2.5 w-full rounded-full shadow-inner ring-1 ring-white/10"
            style={{
              background:
                gayaVisual === "copernicus"
                  ? "linear-gradient(to right, rgba(255,247,243,0.2) 0%, #fde1de 12%, #fcc7c3 24%, #faa3b6 36%, #f872a4 48%, #e23e99 60%, #b90d84 72%, #91017a 82%, #680172 92%, #49006a 100%)"
                  : gayaVisual === "sh_Oranges_aod"
                  ? "linear-gradient(to right, #fff7ee 0%, #ffaa26 30%, #f57d00 60%, #e65200 85%, #bf360c 100%)"
                  : "linear-gradient(to right, #0055ff 0%, #00e5ff 20%, #1aff1a 40%, #ffff00 60%, #ff3300 80%, #80001a 100%)",
            }}
          />

          <div className="flex justify-between text-[10px] text-white/50">
            <span>Bersih</span>
            <span>Sedang</span>
            <span>Pekat</span>
          </div>
        </div>

        {/* Atribusi Resmi & Lisensi Data */}
        <div className="mt-3 pt-2.5 border-t border-white/10 text-[10px] leading-relaxed text-white/50 space-y-1.5">
          {modelRunWib && (
            <div className="flex items-center justify-between pb-1 border-b border-white/[0.06] text-white/70">
              <span className="text-[10px] text-zinc-400">Siklus Model CAMS:</span>
              <span className="font-mono text-[10px] text-amber-300 font-medium">{modelRunWib}</span>
            </div>
          )}
          <p>
            Contains modified{" "}
            <a
              href="https://atmosphere.copernicus.eu/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/70 hover:text-white underline underline-offset-2 transition-colors"
            >
              Copernicus Atmosphere Monitoring Service
            </a>{" "}
            information 2026.
          </p>
          <p className="text-white/40 text-[9.5px]">
            Peta dasar: &copy;{" "}
            <a
              href="https://s2maps.eu"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 hover:text-white underline underline-offset-2 transition-colors"
            >
              EOX IT Services GmbH
            </a>{" "}
            (Sentinel-2 cloudless)
          </p>
        </div>
      </div>

      {/* Logo Copernicus CAMS (Pojok Kiri Bawah - Konsisten dengan Kualitas Udara) */}
      <div className="pointer-events-auto absolute bottom-24 left-3 z-[400] xl:bottom-4 xl:left-5 flex items-center">
        <a
          href="https://atmosphere.copernicus.eu/"
          target="_blank"
          rel="noopener noreferrer"
          title="Copernicus Atmosphere Monitoring Service"
          aria-label="Copernicus Atmosphere Monitoring Service"
          className="group flex items-center gap-2 rounded-xl bg-black/75 px-2.5 py-1.5 shadow-xl ring-1 ring-white/15 backdrop-blur-md transition-all hover:bg-black hover:ring-white/30 active:scale-95"
        >
          <Image
            src="/assets/img/copernicus-white.svg"
            alt="Copernicus Atmosphere Monitoring Service"
            width={120}
            height={44}
            className="h-5 sm:h-6 w-auto opacity-90 transition-opacity group-hover:opacity-100 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]"
          />
        </a>
      </div>

      {/* Kontrol Linimasa Animasi (Tengah Bawah) */}
      <div className="pointer-events-auto absolute bottom-4 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-[450] w-auto sm:w-[560px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/[0.1] bg-[#0c121e]/90 p-2.5 sm:px-4 sm:py-3 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col gap-2.5">
          {/* Baris Atas: Tombol Putar, Navigasi, Info Waktu & Status */}
          <div className="flex items-center justify-between gap-1.5 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Tombol Play/Pause */}
              <button
                type="button"
                onClick={() => setMemutar(!memutar)}
                className="flex h-8 w-8 min-w-[32px] items-center justify-center rounded-full bg-gradient-to-r from-[#86198f] to-[#b90d84] text-white shadow-md shadow-purple-950/60 ring-1 ring-fuchsia-400/40 hover:brightness-110 active:scale-95 transition-all"
                aria-label={memutar ? "Jeda animasi sebaran asap" : "Putar animasi sebaran asap"}
              >
                {memutar ? (
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                    <rect x="6" y="5" width="4" height="14" rx="1.5" />
                    <rect x="14" y="5" width="4" height="14" rx="1.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" className="ml-0.5">
                    <polygon points="6 4 20 12 6 20" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              {/* Tombol Frame Sebelumnya */}
              <button
                type="button"
                onClick={() => {
                  const maxStep = Math.max(1, linimasa.length - 1);
                  const target = Math.max(0, Math.floor(progressRef.current) - 1);
                  progressRef.current = target;
                  setIndeksAktif(target);
                  if (sliderInputRef.current) {
                    sliderInputRef.current.value = target.toString();
                    sliderInputRef.current.style.setProperty("--progress-percent", `${((target / maxStep) * 100).toFixed(1)}%`);
                  }
                  if (muatFrameRef.current && linimasaRef.current.length > 0) {
                    const mA = linimasaRef.current[target];
                    const mB = linimasaRef.current[(target + 1) % linimasaRef.current.length];
                    if (mA) muatFrameRef.current(mA);
                    if (mB) muatFrameRef.current(mB);
                  }
                  mapRef.current?.triggerRepaint();
                }}
                aria-label="Titik waktu sebelumnya"
                title="Waktu sebelumnya"
                className="flex h-8 w-8 min-w-[32px] items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>

              {/* Tombol Frame Berikutnya */}
              <button
                type="button"
                onClick={() => {
                  const maxStep = Math.max(1, linimasa.length - 1);
                  const target = (Math.floor(progressRef.current) + 1) % linimasa.length;
                  progressRef.current = target;
                  setIndeksAktif(target);
                  if (sliderInputRef.current) {
                    sliderInputRef.current.value = target.toString();
                    sliderInputRef.current.style.setProperty("--progress-percent", `${((target / maxStep) * 100).toFixed(1)}%`);
                  }
                  if (muatFrameRef.current && linimasaRef.current.length > 0) {
                    const mA = linimasaRef.current[target];
                    const mB = linimasaRef.current[(target + 1) % linimasaRef.current.length];
                    if (mA) muatFrameRef.current(mA);
                    if (mB) muatFrameRef.current(mB);
                  }
                  mapRef.current?.triggerRepaint();
                }}
                aria-label="Titik waktu berikutnya"
                title="Waktu berikutnya"
                className="flex h-8 w-8 min-w-[32px] items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>

              {/* Toggle Kecepatan */}
              <button
                type="button"
                onClick={() => setKecepatan(kecepatan === 1 ? 2 : 1)}
                title="Kecepatan putar"
                className="flex h-8 min-w-[32px] items-center justify-center rounded-md px-2 text-[11px] font-mono font-medium text-zinc-400 hover:text-zinc-200 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] transition-all"
              >
                {kecepatan}×
              </button>
            </div>

            {/* Label Waktu Aktif & Status */}
            <div className="flex flex-col items-end justify-center min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 text-right min-w-0 justify-end">
                {jumlahFrameTerunduh < linimasa.length && (
                  <span className="hidden sm:inline-block rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-zinc-400 border border-white/[0.06]">
                    {persentaseCache}%
                  </span>
                )}
                <span className="text-xs sm:text-sm font-semibold tracking-tight text-white tabular-nums truncate">
                  {langkahSekarang?.labelWib || "Memuat..."}
                </span>
                <span
                  title={
                    langkahSekarang?.adalahPrediksi
                      ? modelRunWib
                        ? `Prakiraan simulasi numerik ECMWF CAMS diinisialisasi dari siklus model ${modelRunWib}`
                        : "Prakiraan simulasi numerik ECMWF CAMS"
                      : "Data observasi analisis kondisi teramati"
                  }
                  className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-full px-1.5 sm:px-2 py-0.5 text-[10px] font-medium border shrink-0 transition-colors ${
                    langkahSekarang?.adalahPrediksi
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                      : "bg-sky-500/15 text-sky-300 border-sky-500/30"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      langkahSekarang?.adalahPrediksi ? "bg-amber-400 animate-pulse" : "bg-sky-400"
                    }`}
                  />
                  <span className="text-[9px] sm:text-[10px]">{langkahSekarang?.adalahPrediksi ? "Prediksi" : "Analisis"}</span>
                </span>
              </div>

              {/* Sub-keterangan: Siklus Basis Model saat Prediksi / Analisis Teramati */}
              <div className="text-[9.5px] leading-tight text-zinc-400/90 font-mono tracking-tight mt-0.5 truncate max-w-[210px] sm:max-w-[320px]">
                {langkahSekarang?.adalahPrediksi ? (
                  <span
                    title={modelRunWib ? `Hasil prakiraan numerik dari siklus model CAMS ${modelRunWib}` : undefined}
                    className="flex items-center gap-1 justify-end cursor-help"
                  >
                    <span className="text-amber-400/80 font-sans font-medium text-[9px]">Basis Model:</span>
                    <span className="text-zinc-300">{modelRunWib || "ECMWF CAMS"}</span>
                  </span>
                ) : (
                  <span className="text-zinc-500 font-sans text-[9px]">Analisis Teramati Satelit</span>
                )}
              </div>
            </div>
          </div>

          {/* Baris Bawah: Slider Linimasa */}
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-[10px] font-medium text-zinc-400/80 tabular-nums select-none shrink-0 min-w-[32px] sm:min-w-[34px]">
              {linimasa[0]?.labelWib?.split(",")[0] || ""}
            </span>
            <div className="relative flex-1 flex items-center">
              <input
                ref={sliderInputRef}
                type="range"
                min={0}
                max={Math.max(0, linimasa.length - 1)}
                step={0.01}
                defaultValue={0}
                onChange={handleSliderChange}
                onPointerDown={handlePointerDown}
                aria-label="Geser linimasa prediksi waktu sebaran asap"
                className="timeline-slider"
                style={{ ["--progress-percent" as string]: "0%" }}
              />
            </div>
            <span className="text-[10px] font-medium text-zinc-400/80 tabular-nums select-none shrink-0 min-w-[32px] sm:min-w-[34px] text-right">
              {linimasa[linimasa.length - 1]?.labelWib?.split(",")[0] || ""}
            </span>
          </div>
        </div>
      </div>

      {/* Overlay Blurry Blocking saat Proses Sync Sebaran Asap */}
      <div
        className={`absolute inset-0 z-[500] flex items-center justify-center p-4 transition-opacity duration-300 ${
          sedangSync
            ? "pointer-events-auto opacity-100 backdrop-blur-sm bg-black/60"
            : "pointer-events-none opacity-0 backdrop-blur-none bg-transparent"
        }`}
        aria-live="polite"
        aria-busy={sedangSync}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          {galatSync ? (
            <>
              <svg
                viewBox="0 0 24 24"
                width="28"
                height="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="text-rose-400"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">Gagal memuat sebaran asap</p>
                <p className="max-w-[280px] text-xs text-white/60">{galatSync}</p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => sinkronkanSebaranAsap(true)}
                  className="rounded-lg bg-gradient-to-r from-[#86198f] to-[#b90d84] px-4 py-2 text-xs font-semibold text-white shadow-md shadow-purple-950/60 ring-1 ring-fuchsia-400/40 transition-opacity hover:opacity-90"
                >
                  Coba Lagi
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGalatSync(null);
                    setSedangSync(false);
                  }}
                  className="text-xs font-medium text-white/60 underline underline-offset-2 transition-colors hover:text-white"
                >
                  Tutup
                </button>
              </div>
            </>
          ) : (
            <>
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="animate-spin text-fuchsia-400"
              >
                <circle cx="12" cy="12" r="9" className="opacity-20" />
                <path d="M12 3a9 9 0 0 1 9 9" />
              </svg>
              <p className="text-sm font-medium text-white/90 tabular-nums">
                Menyinkronkan sebaran asap… {progresSync}%
              </p>
              <div className="h-1 w-52 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#86198f] to-[#b90d84] transition-all duration-200 ease-out"
                  style={{ width: `${progresSync}%` }}
                />
              </div>
              {waktuTungguLama && (
                <button
                  type="button"
                  onClick={() => {
                    setSedangSync(false);
                    setWaktuTungguLama(false);
                  }}
                  className="text-xs font-medium text-white/50 underline underline-offset-2 transition-colors hover:text-white"
                >
                  Lewati
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* CSS Khusus Badge Angka Laporan & Peta */}
      <style jsx global>{`
        .timeline-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 4px;
          border-radius: 9999px;
          background: linear-gradient(
            to right,
            #86198f 0%,
            #b90d84 var(--progress-percent, 0%),
            rgba(255, 255, 255, 0.15) var(--progress-percent, 0%),
            rgba(255, 255, 255, 0.15) 100%
          );
          outline: none;
          cursor: pointer;
          transition: height 0.15s ease;
        }
        .timeline-slider:hover {
          height: 6px;
        }
        .timeline-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid #b90d84;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
          cursor: grab;
          transition: transform 0.12s ease, box-shadow 0.12s ease;
        }
        .timeline-slider:hover::-webkit-slider-thumb {
          transform: scale(1.15);
        }
        .timeline-slider:active::-webkit-slider-thumb {
          cursor: grabbing;
          transform: scale(1.25);
          box-shadow: 0 0 0 4px rgba(185, 13, 132, 0.35);
        }
        .timeline-slider::-moz-range-thumb {
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid #b90d84;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
          cursor: grab;
        }
        .timeline-slider::-moz-range-track {
          background: transparent;
        }
        .peta-angka {
          width: 0;
          height: 0;
          overflow: visible;
          pointer-events: none;
        }
        .peta-angka__nilai {
          position: absolute;
          top: 0;
          left: 0;
          transform: translate(-50%, -50%);
          white-space: nowrap;
          font-size: 14px;
          font-weight: 700;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          color: #fff;
          text-shadow:
            0 0 3px rgb(26 25 25 / 0.85),
            1px 1px 0 rgb(26 25 25 / 0.7),
            -1px 1px 0 rgb(26 25 25 / 0.7),
            1px -1px 0 rgb(26 25 25 / 0.7),
            -1px -1px 0 rgb(26 25 25 / 0.7);
          pointer-events: none;
        }
        .peta-angka--bertumpuk {
          display: none;
        }
        .maplibregl-canvas {
          outline: none;
        }
      `}</style>
    </div>
  );
}
