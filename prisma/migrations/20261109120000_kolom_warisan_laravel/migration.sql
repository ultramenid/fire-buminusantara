-- Kolom & indeks warisan aplikasi Laravel yang sudah ada di basis data bersama
-- (events.desc_id, events.desc_en, indeks comments(page_id, is_approved)) tetapi
-- belum tercatat di schema.prisma maupun migrasi: drift ini membuat `migrate diff`
-- di CI gagal dan `migrate dev` menyusun DROP-nya. Next.js tidak memakainya.
--
-- Idempoten, karena DB produksi/salinannya sudah memilikinya sedangkan DB baru (CI)
-- belum: tiap langkah hanya dijalankan bila belum ada. Lewat PREPARE, bukan
-- `ADD COLUMN IF NOT EXISTS`, supaya jalan di MariaDB (CI) maupun MySQL (lokal).

SET @perlu := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events' AND COLUMN_NAME = 'desc_id');
SET @sql := IF(@perlu, 'ALTER TABLE `events` ADD COLUMN `desc_id` TEXT NULL AFTER `title_en`', 'DO 0');
PREPARE langkah FROM @sql;
EXECUTE langkah;
DEALLOCATE PREPARE langkah;

SET @perlu := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events' AND COLUMN_NAME = 'desc_en');
SET @sql := IF(@perlu, 'ALTER TABLE `events` ADD COLUMN `desc_en` TEXT NULL AFTER `desc_id`', 'DO 0');
PREPARE langkah FROM @sql;
EXECUTE langkah;
DEALLOCATE PREPARE langkah;

SET @perlu := (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comments' AND INDEX_NAME = 'comments_page_id_is_approved_index');
SET @sql := IF(@perlu, 'CREATE INDEX `comments_page_id_is_approved_index` ON `comments`(`page_id`, `is_approved`)', 'DO 0');
PREPARE langkah FROM @sql;
EXECUTE langkah;
DEALLOCATE PREPARE langkah;
