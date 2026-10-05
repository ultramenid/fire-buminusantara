import { test } from "node:test";
import assert from "node:assert/strict";
import { TIPE, whereKomentar } from "./moderasi-komentar.ts";
import { saring } from "./komentar.ts";
import { penandaPengunjung } from "./suka.ts";
import { halamanDari, urutDari } from "../app/admin/saring.ts";

test("whereKomentar: bawaan tanpa syarat hanya memfilter commentable_type", () => {
  const hasil = whereKomentar({});
  assert.deepEqual(hasil, {
    commentable_type: TIPE,
  });
});

test("whereKomentar: status belum menyaring is_approved false", () => {
  const hasil = whereKomentar({ status: "belum" });
  assert.deepEqual(hasil, {
    commentable_type: TIPE,
    is_approved: false,
  });
});

test("whereKomentar: status disetujui menyaring is_approved true", () => {
  const hasil = whereKomentar({ status: "disetujui" });
  assert.deepEqual(hasil, {
    commentable_type: TIPE,
    is_approved: true,
  });
});

test("whereKomentar: filter kejadian menyaring commentable_id", () => {
  const hasil = whereKomentar({ kejadian: 123 });
  assert.deepEqual(hasil, {
    commentable_type: TIPE,
    commentable_id: 123,
  });
});

test("whereKomentar: pencarian kata kunci menyaring nama atau isi komentar", () => {
  const hasil = whereKomentar({ cari: "kebakaran" });
  assert.deepEqual(hasil, {
    commentable_type: TIPE,
    OR: [
      { name: { contains: "kebakaran" } },
      { body: { contains: "kebakaran" } },
    ],
  });
});

test("whereKomentar: kombinasi status, kejadian, dan pencarian kata kunci", () => {
  const hasil = whereKomentar({ status: "belum", kejadian: 50, cari: "hutan" });
  assert.deepEqual(hasil, {
    commentable_type: TIPE,
    is_approved: false,
    commentable_id: 50,
    OR: [
      { name: { contains: "hutan" } },
      { body: { contains: "hutan" } },
    ],
  });
});

test("saring: sensor kata kasar pendek (<= 3 huruf) menyisakan 1 huruf", () => {
  // 'tai' (3 huruf) -> 't**'
  assert.equal(saring("dasar tai"), "dasar t**");
});

test("saring: sensor kata kasar panjang (> 3 huruf) menyisakan 2 huruf", () => {
  // 'anjing' (6 huruf) -> 'an****'
  assert.equal(saring("kamu anjing"), "kamu an****");
  // 'babi' (4 huruf) -> 'ba**'
  assert.equal(saring("ada babi"), "ada ba**");
  // 'bangsat' (7 huruf) -> 'ba*****'
  assert.equal(saring("jangan bangsat"), "jangan ba*****");
});

test("saring: mempertahankan huruf besar/kecil asli saat menyensor", () => {
  assert.equal(saring("ANJING"), "AN****");
  assert.equal(saring("TAI"), "T**");
  assert.equal(saring("BaBi"), "Ba**");
});

test("saring: tidak menyensor kata wajar yang mengandung substring kasar (word boundary)", () => {
  assert.equal(saring("kita sedang bersantai di pantai"), "kita sedang bersantai di pantai");
  assert.equal(saring("membayangkan hal indah"), "membayangkan hal indah");
});

test("saring: teks bersih tanpa kata kasar tidak diubah", () => {
  const bersih = "Semoga petugas pemadam kebakaran selalu diberi keselamatan.";
  assert.equal(saring(bersih), bersih);
});

test("suka: penandaPengunjung menghasilkan sha256 konsisten dari IP dan User-Agent", () => {
  const hash1 = penandaPengunjung("192.168.1.1", "Mozilla/5.0");
  const hash2 = penandaPengunjung("192.168.1.1", "Mozilla/5.0");
  const hash3 = penandaPengunjung("192.168.1.2", "Mozilla/5.0");
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  assert.match(hash1, /^[0-9a-f]{64}$/);
});

test("suka: penandaPengunjung menangani ip atau user-agent bernilai null", () => {
  const hashNull = penandaPengunjung(null, null);
  assert.match(hashNull, /^[0-9a-f]{64}$/);
});

test("saring admin: halamanDari menjepit nilai halaman dalam rentang 1 sampai max", () => {
  // total 45, per 20 -> 3 halaman
  assert.equal(halamanDari({ halaman: "1" }, 45, 20), 1);
  assert.equal(halamanDari({ halaman: "2" }, 45, 20), 2);
  assert.equal(halamanDari({ halaman: "3" }, 45, 20), 3);
  assert.equal(halamanDari({ halaman: "10" }, 45, 20), 3); // dijepit ke 3
  assert.equal(halamanDari({ halaman: "-5" }, 45, 20), 1); // dijepit ke 1
  assert.equal(halamanDari({ halaman: "tidak-sah" }, 45, 20), 1);
  assert.equal(halamanDari({}, 45, 20), 1);
  assert.equal(halamanDari({ halaman: "1" }, 0, 20), 1);
});

test("saring admin: urutDari memvalidasi daftar kolom yang diizinkan", () => {
  const izin = ["created_at", "name"] as const;
  const bawaan = "-created_at";

  // Nilai valid
  assert.deepEqual(urutDari({ urut: "name" }, izin, bawaan), { kolom: "name", arah: "asc" });
  assert.deepEqual(urutDari({ urut: "-name" }, izin, bawaan), { kolom: "name", arah: "desc" });
  assert.deepEqual(urutDari({ urut: "created_at" }, izin, bawaan), { kolom: "created_at", arah: "asc" });
  assert.deepEqual(urutDari({ urut: "-created_at" }, izin, bawaan), { kolom: "created_at", arah: "desc" });

  // Nilai tidak valid jatuh ke bawaan
  assert.deepEqual(urutDari({ urut: "hacker_column" }, izin, bawaan), { kolom: "created_at", arah: "desc" });
  assert.deepEqual(urutDari({ urut: "" }, izin, bawaan), { kolom: "created_at", arah: "desc" });
  assert.deepEqual(urutDari({}, izin, bawaan), { kolom: "created_at", arah: "desc" });
});

test("reaksi: komputasi persentase progress bar sebanding kejadian teramai", () => {
  const hitungPersen = (jumlah: number, terbanyak: number) =>
    terbanyak ? (jumlah / terbanyak) * 100 : 0;

  assert.equal(hitungPersen(50, 100), 50);
  assert.equal(hitungPersen(100, 100), 100);
  assert.equal(hitungPersen(25, 100), 25);
  assert.equal(hitungPersen(0, 100), 0);
  assert.equal(hitungPersen(0, 0), 0);
  assert.equal(hitungPersen(10, 0), 0); // mencegah NaN / division by zero
});
