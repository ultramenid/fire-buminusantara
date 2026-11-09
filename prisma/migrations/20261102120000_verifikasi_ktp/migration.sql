-- Verifikasi KTP untuk siaran langsung publik dari aplikasi mobile: pengajuan
-- (foto KTP di KTP_DIR, NIK polos hanya selama menunggu) dan tanda terverifikasi di
-- akun, berikut HMAC NIK yang unik — satu NIK untuk satu akun. Semuanya
-- tambahan; tidak ada kolom lama yang diubah atau dibuang.

-- AlterTable
ALTER TABLE `users` ADD COLUMN `ktp_nik_hash` CHAR(64) NULL,
    ADD COLUMN `ktp_verified_at` TIMESTAMP(0) NULL;

-- CreateTable
CREATE TABLE `mobile_ktp_verifications` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `status` ENUM('menunggu', 'disetujui', 'ditolak') NOT NULL DEFAULT 'menunggu',
    `nik` VARCHAR(16) NULL,
    `nik_hash` CHAR(64) NOT NULL,
    `ktp_path` VARCHAR(64) NULL,
    `method` ENUM('petugas', 'ekyc') NULL,
    `reason` TEXT NULL,
    `reviewer_id` BIGINT UNSIGNED NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `decided_at` TIMESTAMP(0) NULL,

    INDEX `mobile_ktp_verifications_user_id_created_at_index`(`user_id`, `created_at`),
    INDEX `mobile_ktp_verifications_status_created_at_index`(`status`, `created_at`),
    INDEX `mobile_ktp_verifications_reviewer_id_foreign`(`reviewer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `users_ktp_nik_hash_unique` ON `users`(`ktp_nik_hash`);

-- AddForeignKey
ALTER TABLE `mobile_ktp_verifications` ADD CONSTRAINT `mobile_ktp_verifications_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `mobile_ktp_verifications` ADD CONSTRAINT `mobile_ktp_verifications_reviewer_id_foreign` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
