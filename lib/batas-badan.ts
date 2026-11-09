/**
 * Badan JSON kecil dari klien publik (komentar, laporkan, tiket, siaran, profil).
 *
 * req.json() menyangga badan sebesar apa pun sebelum di-parse — satu kiriman
 * ratusan MB cukup untuk menghabiskan memori proses. Di sini Content-Length
 * wajib ada dan ≤ batas (ditolak sebelum satu byte pun dibaca), lalu badannya
 * tetap dibaca dengan atap keras karena header bisa berbohong (chunked).
 */
export const BATAS_BADAN = 16 * 1024;

// `galat` dibaca aplikasi mobile (lib/akun-mobile galat()), `message` dibaca form web.
const terlaluBesar = () =>
  Response.json({ galat: "Kiriman terlalu besar.", message: "Kiriman terlalu besar." }, { status: 413 });

/** Seluruh badan, dibaca potong demi potong dengan atap keras; null bila
 *  melewati `batas` (pembacaan dihentikan saat itu juga). */
async function sangga(badan: ReadableStream<Uint8Array>, batas: number): Promise<Buffer | null> {
  const pembaca = badan.getReader();
  const potongan: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await pembaca.read();
    if (done) break;
    total += value.byteLength;
    if (total > batas) {
      void pembaca.cancel().catch(() => {});
      return null;
    }
    potongan.push(value);
  }
  return Buffer.concat(potongan);
}

/** JSON objek dari badan permintaan; null bila kosong/rusak; Response 413 bila terlalu besar. */
export async function bacaJson(req: Request, batas = BATAS_BADAN): Promise<Record<string, unknown> | null | Response> {
  const panjang = req.headers.get("content-length");
  if (panjang === null || !(Number(panjang) <= batas)) return terlaluBesar();
  if (!req.body) return null;

  try {
    const isi = await sangga(req.body, batas);
    if (!isi) return terlaluBesar();
    const json: unknown = JSON.parse(isi.toString("utf8"));
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Badan multipart/form-data kecil (verifikasi KTP) dengan atap keras yang sama:
 * req.formData() juga menyangga badan sebesar apa pun. Beda dengan bacaJson,
 * Content-Length tidak diwajibkan — klien React Native tidak dijamin
 * mengirimnya — tapi bila ada dan melebihi batas, ditolak sebelum dibaca.
 * null = bukan multipart atau rusak; Response 413 bila terlalu besar.
 */
export async function bacaFormData(req: Request, batas: number): Promise<FormData | null | Response> {
  const panjang = req.headers.get("content-length");
  if (panjang !== null && !(Number(panjang) <= batas)) return terlaluBesar();
  const jenis = req.headers.get("content-type") ?? "";
  if (!req.body || !/^multipart\/form-data;/i.test(jenis)) return null;

  try {
    const isi = await sangga(req.body, batas);
    if (!isi) return terlaluBesar();
    return await new Response(new Uint8Array(isi), { headers: { "content-type": jenis } }).formData();
  } catch {
    return null;
  }
}
