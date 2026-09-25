// Benih data pengembangan. `prisma generate` harus sudah jalan, dan
// DATABASE_URL terpasang di .env (dotenv dipanggil manual — Prisma 7
// lewat driver adapter, bukan env di schema).
import "dotenv/config";
import bcrypt from "bcryptjs";
import { getCliPrisma } from "./lib/db.mjs";

const prisma = getCliPrisma(5);

const sekarang = new Date();

async function main() {
  const admin = await prisma.users.upsert({
    where: { email: "admin@pasopati.test" },
    update: {},
    create: {
      name: "Admin Pasopati",
      email: "admin@pasopati.test",
      role: "admin",
      password: await bcrypt.hash("admin123", 10),
      email_verified_at: sekarang,
      created_at: sekarang,
      updated_at: sekarang,
    },
  });

  const kejadian = [
    {
      title_id: "Kebakaran Rumah di Jalan Pasopati",
      title_en: "House Fire on Pasopati Street",
      slug: "kebakaran-rumah-jalan-pasopati",
      description_id: "Kebakaran menimpa sebuah rumah tinggal. Tim pemadam berhasil mengendalikan api dalam dua jam.",
      description_en: "A fire broke out in a residential house. The firefighters contained it within two hours.",
      event_date: new Date("2026-08-15"),
      location: "Bandung, Jawa Barat",
      location_lat: -6.914744,
      location_lng: 107.609810,
      orientation: "landscape",
      created_at: sekarang,
      updated_at: sekarang,
    },
    {
      title_id: "Kebakaran Ruko di Alun-Alun",
      title_en: "Shophouse Fire at the Town Square",
      slug: "kebakaran-ruko-alun-alun",
      description_id: "Empat unit ruko terdampak. Tidak ada korban jiwa; evakuasi berjalan lancar.",
      description_en: "Four shophouse units were affected. No casualties; evacuation went smoothly.",
      event_date: new Date("2026-08-22"),
      location: "Bandung, Jawa Barat",
      location_lat: -6.921971,
      location_lng: 107.607153,
      orientation: "horizontal",
      created_at: sekarang,
      updated_at: sekarang,
    },
  ];

  for (const k of kejadian) {
    await prisma.events.upsert({ where: { slug: k.slug }, update: {}, create: k });
  }

  const adaKomentar = await prisma.comments.count();
  if (adaKomentar === 0) {
    await prisma.comments.create({
      data: {
        commentable_type: "events",
        user_id: admin.id,
        body: "Terima kasih atas kerja keras tim pemadam!",
        is_approved: true,
        created_at: sekarang,
        updated_at: sekarang,
      },
    });
  }

  // ── Laporan warga ─────────────────────────────────────────────────────────
  // `public_reports` tidak punya kolom unik untuk di-upsert, jadi keidempotenan
  // dijaga lewat penanda umum (sebagian laporan diberi koordinat) dan hitungan:
  // hanya dibuat ketika tabel masih kosong, supaya menjalankan `npm run seed`
  // berulang tidak menumpuk data pengembangan.
  const laporanWarga = [
    {
      title: "Asap tebal dari lahan kosong di Cisarua",
      description:
        "Terlihat asap tebal membumbung dari lahan kosong dekat pemukiman sejak pagi. Belum ada petugas, mohon dicek.",
      media: [],
      reporter_name: "Budi Santoso",
      location_lat: -6.836029,
      location_lng: 107.494909,
      status: "pending",
    },
    {
      title: "Api kecil di tepi sawah, Cicalengka",
      description: "Ada bara kecil di tepi sawah, sudah saya padamkan pakai air selokan. Koordinat titik semula.",
      media: [],
      reporter_name: null,
      location_lat: -6.986987,
      location_lng: 107.839817,
      status: "pending",
    },
    {
      title: "Kebakaran lahan gambut di Rokan Hilir",
      description: "Kebakaran lahan gambut meluas sejak kemarin, asap sampai ke jalan raya. Warga mulai sesak napas.",
      media: [],
      reporter_name: "Siti Aminah",
      location_lat: 1.369771,
      location_lng: 100.63189,
      status: "approved",
    },
    {
      title: "Laporan duplikat kebakaran di Cisarua",
      description: "Ternyata laporan saya telat, kejadian sudah ditangani oleh tim pemadam setempat.",
      media: [],
      reporter_name: "Budi Santoso",
      location_lat: -6.836029,
      location_lng: 107.494909,
      status: "rejected",
    },
    {
      title: "Pembakaran sampah di halaman sekolah",
      description: "Pembakaran sampah besar-besaran, asapnya mengganggu kelas sebelah. Bukan kebakaran liar.",
      media: [],
      reporter_name: null,
      location_lat: null,
      location_lng: null,
      status: "pending",
    },
  ];

  const sudahAdaLaporan = await prisma.public_reports.count();
  if (sudahAdaLaporan === 0) {
    for (const l of laporanWarga) {
      await prisma.public_reports.create({
        data: {
          title: l.title,
          description: l.description,
          media: l.media,
          reporter_name: l.reporter_name,
          location_lat: l.location_lat,
          location_lng: l.location_lng,
          status: l.status,
          ip_address: "127.0.0.1",
          created_at: sekarang,
          updated_at: sekarang,
        },
      });
    }
  }

  console.log(
    "Benih selesai: 1 admin (admin@pasopati.test / admin123), 2 kejadian, 1 komentar, " +
    `${sudahAdaLaporan === 0 ? laporanWarga.length : 0} laporan warga.`,
  );
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());