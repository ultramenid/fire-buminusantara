import { redisIncr } from "./redis.ts";

/**
 * Batas laju sederhana per kunci (IP, email): `batas` kali per `jendelaDetik`.
 *
 * Redis bila ada (bertahan lintas restart); kalau tidak, Map di memori proses.
 * ponytail: cadangan memori hanya benar untuk satu instance (box prod sekarang
 * satu container) dan hilang saat restart — pasang REDIS_URL bila web
 * diskalakan ke beberapa container.
 */
const memori = new Map<string, { n: number; habis: number }>();

export async function lewatBatas(kunci: string, batas: number, jendelaDetik: number): Promise<boolean> {
  const n = (await redisIncr(`laju:${kunci}`, jendelaDetik)) ?? hitungMemori(kunci, jendelaDetik);
  return n > batas;
}

function hitungMemori(kunci: string, jendelaDetik: number): number {
  const kini = Date.now();
  const ada = memori.get(kunci);
  if (!ada || ada.habis <= kini) {
    // Bersihkan entri kedaluwarsa sesekali supaya Map tidak tumbuh tanpa batas.
    if (memori.size > 10_000) for (const [k, v] of memori) if (v.habis <= kini) memori.delete(k);
    memori.set(kunci, { n: 1, habis: kini + jendelaDetik * 1000 });
    return 1;
  }
  ada.n += 1;
  return ada.n;
}
