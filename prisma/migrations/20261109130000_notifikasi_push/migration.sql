-- Notifikasi push aplikasi mobile (lib/notifikasi-push.ts): token Expo setiap pemasang aplikasi
-- dan pilihan jenisnya. Tabel baru; tidak ada tabel lama yang diubah.

-- CreateTable
CREATE TABLE `mobile_push_tokens` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(255) NOT NULL,
    `platform` VARCHAR(16) NOT NULL,
    `live` BOOLEAN NOT NULL DEFAULT true,
    `laporan` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `mobile_push_tokens_token_unique`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

