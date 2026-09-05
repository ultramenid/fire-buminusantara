import test from "node:test";
import assert from "node:assert/strict";
import { adaBahasa, BAHASA, TEKS_LAPOR, TEKS_NAV } from "./bahasa.ts";

/** Daftarkan semua path daun ("a.b.c") sebuah kamus — rekursi hanya menembus
 *  objek polos, bukan array maupun nilai. */
function kunciDaun(nilai: unknown, akar = ""): string[] {
  if (typeof nilai !== "object" || nilai === null || Array.isArray(nilai)) {
    return akar ? [akar] : [];
  }
  return Object.entries(nilai as Record<string, unknown>).flatMap(([k, v]) =>
    kunciDaun(v, akar ? `${akar}.${k}` : k),
  );
}

/** Kumpulkan semua daun string beserta path-nya untuk pemeriksaan isi. */
function daunString(nilai: unknown, akar = ""): Array<[string, string]> {
  if (typeof nilai === "string") return akar ? [[akar, nilai]] : [];
  if (typeof nilai !== "object" || nilai === null || Array.isArray(nilai)) return [];
  return Object.entries(nilai as Record<string, unknown>).flatMap(([k, v]) =>
    daunString(v, akar ? `${akar}.${k}` : k),
  );
}

for (const [nama, kamus] of Object.entries({ TEKS_NAV, TEKS_LAPOR })) {
  test(`${nama}: id dan en punya kunci yang sama persis`, () => {
    // Kunci yang hilang di satu bahasa = teks undefined = UI kosong atau
    // crash di produksi (kasus nyata: berkasWajib sempat hanya di satu sisi
    // saat ditambahkan). Test ini memaksa keduanya tumbuh bersama.
    const id = kunciDaun((kamus as Record<string, unknown>).id).sort();
    const en = kunciDaun((kamus as Record<string, unknown>).en).sort();
    assert.deepEqual(en, id);
  });

  for (const bahasa of BAHASA) {
    test(`${nama}.${bahasa}: tidak ada string kosong`, () => {
      const kosong = daunString((kamus as Record<string, unknown>)[bahasa])
        .filter(([, v]) => v.trim() === "")
        .map(([k]) => k);
      assert.deepEqual(kosong, []);
    });
  }
}

test("adaBahasa hanya menerima id/en", () => {
  assert.equal(adaBahasa("id"), true);
  assert.equal(adaBahasa("en"), true);
  assert.equal(adaBahasa(""), false);
  assert.equal(adaBahasa("ID"), false);
  assert.equal(adaBahasa("ms"), false);
});
