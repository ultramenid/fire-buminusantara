import { test, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma.ts";

const BATAL = new Error("rollback uji");

after(() => prisma.$disconnect());

test("dbtest: siklus pembuatan pengguna baru dan verifikasi hash password bcrypt", async () => {
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const emailUji = `uji_${Date.now()}@pasopati.test`;
      const sandiPlain = "SandiUji123!";
      const hashedPassword = await bcrypt.hash(sandiPlain, 10);
      const kini = new Date();

      const userBaru = await tx.users.create({
        data: {
          name: "Editor Uji",
          email: emailUji,
          role: "editor",
          password: hashedPassword,
          email_verified_at: kini,
          created_at: kini,
          updated_at: kini,
        },
      });

      assert.ok(userBaru.id);
      assert.equal(userBaru.role, "editor");

      // Verifikasi hash di DB cocok dengan sandi plain
      const row = await tx.users.findUniqueOrThrow({ where: { id: userBaru.id } });
      assert.ok(row.password);
      assert.equal(await bcrypt.compare(sandiPlain, row.password), true);
      assert.equal(await bcrypt.compare("SalahPassword", row.password), false);

      // Verifikasi keunikan email (P2002)
      await assert.rejects(
        tx.users.create({
          data: {
            name: "Peniru Email",
            email: emailUji,
            role: "editor",
            password: hashedPassword,
          },
        }),
        (e: unknown) => (e as { code?: string })?.code === "P2002",
      );

      throw BATAL; // batalkan transaksi agar tidak meninggalkan baris kotor di DB
    }),
    BATAL,
  );
});

test("dbtest: pengubahan kata sandi dan proteksi akun", async () => {
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const emailUji = `admin_uji_${Date.now()}@pasopati.test`;
      const sandiAwal = await bcrypt.hash("Awal12345", 10);
      const kini = new Date();

      const admin = await tx.users.create({
        data: {
          name: "Admin Kedua",
          email: emailUji,
          role: "admin",
          password: sandiAwal,
          email_verified_at: kini,
          created_at: kini,
          updated_at: kini,
        },
      });

      // Update password
      const sandiBaru = await bcrypt.hash("Baru67890", 10);
      await tx.users.update({
        where: { id: admin.id },
        data: { password: sandiBaru },
      });

      const updated = await tx.users.findUniqueOrThrow({ where: { id: admin.id } });
      assert.equal(await bcrypt.compare("Baru67890", updated.password!), true);
      assert.equal(await bcrypt.compare("Awal12345", updated.password!), false);

      // Update profil tanpa ubah password (password tetap sandiBaru)
      await tx.users.update({
        where: { id: admin.id },
        data: { name: "Admin Kedua Diperbarui" },
      });

      const updatedProfil = await tx.users.findUniqueOrThrow({ where: { id: admin.id } });
      assert.equal(updatedProfil.name, "Admin Kedua Diperbarui");
      assert.equal(await bcrypt.compare("Baru67890", updatedProfil.password!), true);

      throw BATAL;
    }),
    BATAL,
  );
});

test("dbtest: isolasi passkey per user_id saat pencabutan (deleteMany)", async () => {
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const kini = new Date();
      // Buat User A dan User B
      const userA = await tx.users.create({
        data: { name: "User A", email: `usera_${Date.now()}@pasopati.test`, role: "admin", created_at: kini },
      });
      const userB = await tx.users.create({
        data: { name: "User B", email: `userb_${Date.now()}@pasopati.test`, role: "editor", created_at: kini },
      });

      const passkeyB_id = `pk_b_${Date.now()}`;
      await tx.passkeys.create({
        data: {
          id: passkeyB_id,
          user_id: userB.id,
          public_key: Buffer.from([1, 2, 3, 4]),
          counter: BigInt(0),
          transports: "internal",
          created_at: kini,
        },
      });

      // User A mencoba mencabut passkey milik User B
      const hasilHapusOlehUserA = await tx.passkeys.deleteMany({
        where: { id: passkeyB_id, user_id: userA.id },
      });
      // Harusnya 0 baris yang terhapus
      assert.equal(hasilHapusOlehUserA.count, 0, "User A tidak boleh bisa menghapus passkey milik User B");

      // Verifikasi passkey User B masih utuh di DB
      const passkeyBMasihAda = await tx.passkeys.findUnique({ where: { id: passkeyB_id } });
      assert.ok(passkeyBMasihAda, "Passkey milik User B harus tetap ada");

      // User B mencabut passkey miliknya sendiri
      const hasilHapusOlehUserB = await tx.passkeys.deleteMany({
        where: { id: passkeyB_id, user_id: userB.id },
      });
      assert.equal(hasilHapusOlehUserB.count, 1, "User B berhasil mencabut passkey miliknya sendiri");

      const passkeyBSudahHilang = await tx.passkeys.findUnique({ where: { id: passkeyB_id } });
      assert.equal(passkeyBSudahHilang, null, "Passkey harus sudah terhapus");

      throw BATAL;
    }),
    BATAL,
  );
});
