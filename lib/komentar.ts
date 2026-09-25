import { prisma } from "./prisma";
import kataKasar from "./kata-kasar.json";

/** Model polimorfik dipakai bersama halaman lain di Pasopati; nilainya harus
 *  sama persis dengan yang ditulis Laravel. */
const TIPE = "App\\Models\\Event";

export const POLA_KASAR = new RegExp(
  `\\b(?:${(kataKasar as string[])
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})\\b`,
  "giu"
);

export type Komentar = {
  id: number;
  nama: string;
  isi: string;
  waktu: string;
  /** Setiap balasan membawa sebutan, termasuk saat membalas komentar sendiri:
   *  balasan ditampilkan datar dalam satu utas, jadi sebutan inilah satu-satunya
   *  penanda komentar mana yang sedang dijawab. */
  sebutan: string | null;
  balasan?: Komentar[];
};

/** Sensor kata kasar: untuk kata <= 3 huruf sisakan 1 huruf (mis. t**);
 *  untuk kata > 3 huruf sisakan 2 huruf (mis. ba**). */
export function saring(teks: string): string {
  return teks.replace(POLA_KASAR, (cocok) => {
    const simpan = cocok.length <= 3 ? 1 : 2;
    return cocok.slice(0, simpan) + "*".repeat(Math.max(0, cocok.length - simpan));
  });
}

const RELATIF = new Intl.RelativeTimeFormat("id", { numeric: "auto" });
const SATUAN: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000], ["month", 2592000], ["day", 86400],
  ["hour", 3600], ["minute", 60], ["second", 1],
];

/** Padanan diffForHumans() berbahasa Indonesia. */
function waktuRelatif(saat: Date | null): string {
  if (!saat) return "";
  const detik = Math.round((saat.getTime() - Date.now()) / 1000);
  for (const [satuan, besar] of SATUAN) {
    if (Math.abs(detik) >= besar || satuan === "second") {
      return RELATIF.format(Math.round(detik / besar), satuan);
    }
  }
  return "";
}

type Baris = {
  id: bigint; name: string | null; body: string;
  mention_name: string | null; parent_id: bigint | null; created_at: Date | null;
};

function bentuk(k: Baris): Komentar {
  return {
    id: Number(k.id),
    nama: k.name ?? "",
    isi: k.body,
    waktu: waktuRelatif(k.created_at),
    sebutan: k.mention_name,
  };
}

/**
 * Komentar tampil untuk satu laporan: hanya yang lolos moderasi.
 *
 * Akar diurutkan terbaru dulu, sedangkan balasan kronologis — terlama di atas,
 * supaya percakapannya terbaca berurutan.
 *
 * Balasan sedalam apa pun dikumpulkan DATAR di bawah akarnya, bukan bersarang
 * berlapis-lapis: rel pop-up ini sempit, dan @sebutan sudah cukup menerangkan
 * siapa membalas siapa.
 */
export async function daftarKomentar(eventId: number): Promise<Komentar[]> {
  const semua = (await prisma.comments.findMany({
    where: { commentable_type: TIPE, commentable_id: eventId, is_approved: true },
    orderBy: { created_at: "asc" },
    take: 500,
    select: { id: true, name: true, body: true, mention_name: true, parent_id: true, created_at: true },
  })) as Baris[];

  const anak = new Map<number, Baris[]>();
  for (const k of semua) {
    const induk = k.parent_id ? Number(k.parent_id) : 0;
    (anak.get(induk) ?? anak.set(induk, []).get(induk)!).push(k);
  }

  const kumpulkan = (indukId: number): Baris[] => {
    const hasil: Baris[] = [];
    for (const balasan of anak.get(indukId) ?? []) {
      hasil.push(balasan, ...kumpulkan(Number(balasan.id)));
    }
    return hasil;
  };

  return (anak.get(0) ?? [])
    .slice()
    .sort((a, b) => (b.created_at?.getTime() ?? 0) - (a.created_at?.getTime() ?? 0))
    .map((akar) => ({
      ...bentuk(akar),
      balasan: kumpulkan(Number(akar.id))
        .sort((a, b) => (a.created_at?.getTime() ?? 0) - (b.created_at?.getTime() ?? 0))
        .map(bentuk),
    }));
}

/**
 * Simpan satu komentar. Induk dicari DENGAN SYARAT laporan yang sama: tanpa itu
 * sebuah balasan bisa ditempelkan ke komentar milik laporan lain lewat id yang
 * ditebak.
 */
export async function simpanKomentar(input: {
  eventId: number; nama: string; email: string | null; isi: string;
  balasKe: number | null; ip: string | null;
}) {
  return await prisma.$transaction(async (tx) => {
    let parentId: bigint | null = null;
    let mentionName: string | null = null;

    if (input.balasKe) {
      const induk = await tx.comments.findFirst({
        where: {
          id: input.balasKe,
          commentable_type: TIPE,
          commentable_id: input.eventId,
          is_approved: true,
        },
        select: { id: true, name: true },
      });

      if (!induk) {
        throw new Error("Komentar yang dibalas tidak ditemukan atau telah dihapus.");
      }

      parentId = induk.id;
      mentionName = induk.name;
    }

    return await tx.comments.create({
      data: {
        commentable_type: TIPE,
        commentable_id: input.eventId,
        name: input.nama,
        email: input.email,
        body: saring(input.isi),
        ip_address: input.ip,
        is_approved: true,
        parent_id: parentId,
        mention_name: mentionName,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  });
}
