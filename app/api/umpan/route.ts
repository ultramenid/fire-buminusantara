import { connection } from "next/server";
import { ambilUmpan } from "@/lib/events";
import { adaBahasa, type Bahasa } from "@/lib/bahasa";

/** Seluruh umpan (Berita[]) untuk klien — HTML halaman hanya membawa
 *  UMPAN_AWAL kartu pertama. Datanya dari cache bertag ambilUmpan;
 *  connection() mencegah rute ini diprerender saat build (tanpa DB).
 *
 *  Parameter ?bahasa=id|en memilih bahasa judul/deskripsi/tanggal kartu —
 *  kosong atau tak dikenal jatuh ke bahasa Indonesia. */
export async function GET(request: Request) {
  await connection();
  const minta = new URL(request.url).searchParams.get("bahasa");
  const bahasa: Bahasa = adaBahasa(minta ?? "") ? (minta as Bahasa) : "id";
  return Response.json(await ambilUmpan(bahasa), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
  });
}
