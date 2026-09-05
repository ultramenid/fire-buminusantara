"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Map as PetaMaplibre,
  Marker as PenandaMaplibre,
  StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/** Pusat Indonesia — dipakai saat koordinatnya belum diisi. Urutan MapLibre:
 *  [bujur, lintang], kebalikan dari Leaflet. */
const PUSAT: [number, number] = [118, -2.4];

/** Gaya raster sejalur: ubin OSM standar, tanpa kunci API, tanpa peladen
 *  vector. Satu-satunya ketergantungan jaringan adalah CDN ubin OSM. */
const GAYA: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© Kontributor OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

type Props = {
  lat: string;
  lng: string;
  onPilih: (lat: number, lng: number) => void;
};

/**
 * Pemilih titik lokasi untuk form kejadian.
 *
 * Tekan peta untuk menaruh penanda (bisa digeser), dan koordinat yang berubah
 * dari luar peta — hasil pencarian lokasi maupun isian manual — menggerakkan
 * penandanya balik. MapLibre diimpor dinamis supaya pustaka WebGL-nya tidak
 * memberatkan bundel awal CMS.
 *
 * Alasan pindah dari Leaflet: di produksi petanya sering tampil sebaris ubin
 * lalu abu-abu (lihat bawah). Leaflet menata <img> ubin dari ukuran wadah
 * yang diukur SEKALI saat dipasang — `invalidateSize()` satu tembakan lewat
 * setTimeout tidak cukup kalau tata letak akhir belum selesai. MapLibre
 * me-render ke kanvas yang selalu selebar wadah + ResizeObserver memanggil
 * resize() setiap wadah berubah, jadi mode gagal itu hilang seluruhnya.
 */
export function PetaLokasi({ lat, lng, onPilih }: Props) {
  const kotakRef = useRef<HTMLDivElement | null>(null);
  const petaRef = useRef<PetaMaplibre | null>(null);
  const penandaRef = useRef<PenandaMaplibre | null>(null);
  // onPilih ditampung di ref supaya efek pemasangan (yang berjalan sekali)
  // selalu memanggil versi terbaru tanpa perlu dipasang ulang.
  const pilihRef = useRef(onPilih);
  // Fungsi menaruh/menggeser penanda milik efek pemasangan — dipakai efek
  // sinkron di bawah kalau penanda belum ada (kelas Marker hanya tersedia
  // sesudah impor dinamis MapLibre selesai).
  const taruhRef = useRef<((lintang: number, bujur: number) => void) | null>(null);
  // Baru true setelah peta selesai dipasang — efek sinkron di bawah menunggu
  // penanda ini, supaya koordinat yang diubah saat MapLibre masih diunduh
  // tidak lewat begitu saja.
  const [siap, setSiap] = useState(false);
  // Galat fatal (WebGL mati / pustaka gagal dimuat): wadah diganti panel
  // pesan + tombol ulangi, TIDAK pernah dibiarkan kosong. Isian lat/lng
  // manual di bawah tetap berfungsi sehingga kurator tidak terkunci.
  const [gagal, setGagal] = useState<string | null>(null);
  const [coba, setCoba] = useState(0);
  // Ubin gagal dimuat tapi peta hidup: spanduk tipis, peta tetap bisa ditekan
  // (koordinatnya tetap sah) + tombol muat ulang.
  const [ubinBermasalah, setUbinBermasalah] = useState(false);

  useEffect(() => {
    pilihRef.current = onPilih;
  }, [onPilih]);

  /* Pemasangan: peta, penanda, dan reaksi tekanan. Diulang saat "coba"
     bertambah (tombol ulangi sesudah galat). */
  useEffect(() => {
    let batal = false;

    (async () => {
      let maplibregl: typeof import("maplibre-gl");
      try {
        maplibregl = await import("maplibre-gl");
      } catch {
        if (!batal) setGagal("Pustaka peta gagal diunduh. Periksa koneksi lalu ulangi.");
        return;
      }
      // Peramban tanpa WebGL (mode hemat / driver tua): konstruktor Map
      // melempar dan ditangkap di bawah — pesannya menjelaskan pengisiannya
      // tetap bisa lewat isian manual.
      if (batal || !kotakRef.current || petaRef.current) return;

      const a = Number(lat);
      const b = Number(lng);
      const sah = lat.trim() !== "" && lng.trim() !== ""
        && Number.isFinite(a) && Number.isFinite(b);

      let peta: PetaMaplibre;
      try {
        peta = new maplibregl.Map({
          container: kotakRef.current,
          style: GAYA,
          center: sah ? [b, a] : PUSAT,
          zoom: sah ? 13 : 5,
          // Roda tetikus milik guliran halaman; zum cukup lewat tombolnya.
          scrollZoom: false,
          attributionControl: { compact: true },
        });
      } catch (e) {
        if (!batal) setGagal(`Peta tidak bisa dipasang (${e instanceof Error ? e.message : "galat tak dikenal"}). Isi koordinat manual di bawah.`);
        return;
      }
      petaRef.current = peta;

      // Cubit zum ala ponsel boleh, putar dua jari tidak: rotasi tak sengaja
      // membingungkan kurator yang hanya butuh menaruh titik.
      peta.touchZoomRotate.disableRotation();
      peta.addControl(
        new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }),
        "top-right",
      );

      // Wadah CMS bisa berubah ukuran setelah peta dipasang (font/CMS
      // selesai menata letak — inilah yang membuat Leaflet sebaris di
      // produksi). Kanvas MapLibre wajib diberi tahu setiap kali.
      const amati = new ResizeObserver(() => {
        try { peta.resize(); } catch {}
      });
      if (kotakRef.current) amati.observe(kotakRef.current);
      peta.on("load", () => {
        try { peta.resize(); } catch {}
      });
      // Ubin yang gagal (luring sesaat / CDN tersendat) dicatat jadi spanduk,
      // bukan kanvas mati: peta vektor-raster tetap merespons tekanan.
      peta.on("error", () => setUbinBermasalah(true));
      peta.on("data", () => setUbinBermasalah(false));

      const buatPenanda = (lintang: number, bujur: number) => {
        // Elemennya memakai class CSS yang sama seperti era Leaflet
        // (.peta-lokasi-penanda di cms.css) — bentuknya hanya HTML+CSS, jadi
        // selalu tampil apa pun hasil bundelnya. Jangkar tengah = titiknya
        // pas di koordinat yang dilaporkan.
        const el = document.createElement("div");
        el.className = "peta-lokasi-penanda";
        el.innerHTML = '<span aria-hidden="true"></span>';
        const penanda = new maplibregl.Marker({
          element: el,
          draggable: true,
          anchor: "center",
        })
          .setLngLat([bujur, lintang])
          .addTo(peta);
        penanda.on("dragend", () => {
          const p = penanda.getLngLat();
          pilihRef.current(p.lat, p.lng);
        });
        return penanda;
      };

      const taruh = (lintang: number, bujur: number) => {
        if (penandaRef.current) {
          penandaRef.current.setLngLat([bujur, lintang]);
          return;
        }
        penandaRef.current = buatPenanda(lintang, bujur);
      };

      if (sah) taruh(a, b);
      taruhRef.current = taruh;

      peta.on("click", (e) => {
        taruh(e.lngLat.lat, e.lngLat.lng);
        pilihRef.current(e.lngLat.lat, e.lngLat.lng);
      });

      if (!batal) setSiap(true);
      else {
        try { peta.remove(); } catch {}
        petaRef.current = null;
      }

      return () => {
        amati.disconnect();
      };
    })();

    return () => {
      batal = true;
      taruhRef.current = null;
      if (petaRef.current) {
        try { petaRef.current.remove(); } catch {}
        petaRef.current = null;
        penandaRef.current = null;
      }
    };
    // Nilai awal koordinat sengaja hanya dibaca sekali di pemasangan;
    // perubahannya ditangani efek sinkron di bawah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coba]);

  /* Koordinat yang berubah dari luar peta — hasil pencarian lokasi atau isian
     manual — menggerakkan penanda dan pandangannya. Perubahan yang berasal
     dari peta sendiri dikenali dari posisi penanda yang sudah sama, jadi tidak
     saling memicu. */
  useEffect(() => {
    const peta = petaRef.current;
    const a = Number(lat);
    const b = Number(lng);
    if (!peta || lat.trim() === "" || lng.trim() === ""
        || !Number.isFinite(a) || !Number.isFinite(b)) return;

    const penanda = penandaRef.current;
    if (penanda) {
      const kini = penanda.getLngLat();
      if (Math.abs(kini.lat - a) < 1e-9 && Math.abs(kini.lng - b) < 1e-9) return;
      penanda.setLngLat([b, a]);
    } else {
      // Peta sudah dipasang tapi penanda belum ada (koordinat datang belakangan).
      taruhRef.current?.(a, b);
    }
    // Pandangan ikut diperbesar minimal 13: memilih hasil pencarian dari
    // pandangan seluruh Indonesia tanpa ini hanya menggeser, dan titiknya
    // tetap tak terbaca.
    peta.flyTo({ center: [b, a], zoom: Math.max(peta.getZoom(), 13), duration: 600 });
    // `siap`: jalankan ulang setelah peta selesai dipasang — koordinat bisa
    // saja berubah selama MapLibre masih diunduh.
  }, [lat, lng, siap]);

  return (
    /* isolate: z-index panel peta (ratusan) tidak boleh lolos keluar dan
       menutupi menu & bilah aksi sticky milik CMS. */
    <div className="isolate relative h-[320px] w-full overflow-hidden rounded-[3px] border border-[var(--garis-tegas)] bg-[var(--papan)]">
      {gagal ? (
        <div className="grid h-full place-items-center p-6 text-center">
          <div>
            <p className="text-[13.5px] font-semibold text-[var(--jelaga)]">Peta tidak tampil</p>
            <p className="mx-auto mt-1 max-w-[42ch] text-[12.5px] leading-relaxed text-[var(--lirih)]">
              {gagal}
            </p>
            <button
              type="button"
              onClick={() => { setGagal(null); setCoba((n) => n + 1); }}
              className="cms-tombol cms-tombol--garis cms-tombol--kecil mt-3">
              Muat ulang peta
            </button>
          </div>
        </div>
      ) : (
        <div ref={kotakRef} className="h-full w-full" aria-label="Peta pemilih lokasi" />
      )}
      {ubinBermasalah && !gagal && (
        <p role="status"
           className="absolute inset-x-0 top-0 z-[5] flex items-center justify-between gap-2 bg-amber-100/95 px-3 py-1.5 text-[12px] text-amber-900">
          <span>Sebagian gambar peta gagal dimuat — titik tetap bisa ditaruh.</span>
          <button type="button" onClick={() => { setCoba((n) => n + 1); }}
                  className="shrink-0 font-semibold underline">
            Muat ulang
          </button>
        </p>
      )}
    </div>
  );
}
