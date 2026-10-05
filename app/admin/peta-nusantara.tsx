import { readFile } from "node:fs/promises";
import path from "node:path";
import { poligonFitur, kotakCincin } from "@/lib/geometri";
import { namaProvinsiLokal } from "@/lib/wilayah";

/** Lebar kotak pandang; tingginya ikut rasio Nusantara yang sebenarnya. */
const SISI = 1000;

/** Cincin yang seluas kurang dari ini setelah diproyeksikan tidak digambar.
 *  Pada lebar 1000 satuan, pulau sekecil itu jatuh di bawah satu piksel — yang
 *  tersisa cuma titik-titik yang membuat garisnya kotor dan berkasnya besar. */
const CINCIN_MINIMAL = 1.2;

type Fitur = { properties: { nama: string }; geometry: { type: string; coordinates: unknown } };

export type Provinsi = { nama: string; d: string; pusatX: number };

/**
 * Siluet 34 provinsi dalam SATU kotak pandang bersama.
 *
 * Sengaja tidak memakai `jalurSvg()`: helper itu mengepaskan tiap provinsi ke
 * kotaknya sendiri — benar untuk ikon di kartu, salah di sini, karena yang
 * dicari justru letak tiap provinsi RELATIF terhadap yang lain.
 */
export async function bacaNusantara(): Promise<{ provinsi: Provinsi[]; lebar: number; tinggi: number }> {
  const berkas = await readFile(
    path.join(process.cwd(), "public", "data", "peta-provinsi.json"),
    "utf8",
  );
  const fitur: Fitur[] = JSON.parse(berkas).features ?? [];

  let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
  for (const f of fitur) {
    for (const poligon of poligonFitur(f.geometry)) {
      for (const cincin of poligon) {
        const [a, b, x, y] = kotakCincin(cincin);
        if (a < minX) minX = a; if (x > maksX) maksX = x;
        if (b < minY) minY = b; if (y > maksY) maksY = y;
      }
    }
  }

  const skala = SISI / (maksX - minX);
  const px = (x: number) => (x - minX) * skala;
  const py = (y: number) => (maksY - y) * skala; // sumbu y SVG tumbuh ke bawah

  const provinsi: Provinsi[] = [];
  for (const f of fitur) {
    const bagian: string[] = [];
    let kiri = Infinity, kanan = -Infinity;

    for (const poligon of poligonFitur(f.geometry)) {
      for (const cincin of poligon) {
        if (cincin.length < 3) continue;
        const [a, b, x, y] = kotakCincin(cincin);
        if ((x - a) * skala * ((y - b) * skala) < CINCIN_MINIMAL) continue;
        if (px(a) < kiri) kiri = px(a);
        if (px(x) > kanan) kanan = px(x);
        bagian.push(`M${cincin.map(([bx, by]) => `${px(bx).toFixed(1)} ${py(by).toFixed(1)}`).join("L")}Z`);
      }
    }

    if (bagian.length) {
      provinsi.push({ nama: f.properties.nama, d: bagian.join(""), pusatX: (kiri + kanan) / 2 });
    }
  }

  // Urut barat ke timur: itu urutan gambarnya ditarik, seperti garis pantai
  // yang disusuri dari Aceh ke Papua.
  provinsi.sort((a, b) => a.pusatX - b.pusatX);

  return { provinsi, lebar: SISI, tinggi: (maksY - minY) * skala };
}

/**
 * Nusantara sebagai garis rambut, dengan satu provinsi menyala.
 *
 * Dipakai di halaman masuk: yang menunggu di balik pintu ini adalah pantauan
 * kebakaran seluruh Indonesia, jadi petanya sendiri yang menyambut — bukan
 * ilustrasi umum yang bisa dipakai produk mana pun.
 */
export function PetaNusantara({
  provinsi, lebar, tinggi, sorot, className,
}: {
  provinsi: Provinsi[];
  lebar: number;
  tinggi: number;
  /** Nama provinsi yang diisi warna bara — boleh ejaan layanan luar. */
  sorot?: string | null;
  className?: string;
}) {
  const disorot = sorot ? namaProvinsiLokal(sorot) : null;

  return (
    <svg viewBox={`0 0 ${lebar} ${tinggi.toFixed(1)}`} aria-hidden="true" focusable="false"
         preserveAspectRatio="xMidYMid meet" className={`cms-peta ${className ?? ""}`}>
      {provinsi.map((p, i) => {
        const nyala = p.nama === disorot;
        return (
          <path
            key={p.nama}
            d={p.d}
            pathLength={1}
            className={nyala ? "cms-peta__sorot" : undefined}
            fill={nyala ? "#e60012" : "none"}
            fillOpacity={nyala ? 0.9 : 0}
            stroke={nyala ? "#ffd7d0" : "#3b3b3f"}
            strokeWidth={nyala ? 2 : 1.1}
            strokeLinejoin="round"
            style={{ animationDelay: `${i * 22}ms` }}
          />
        );
      })}
    </svg>
  );
}
