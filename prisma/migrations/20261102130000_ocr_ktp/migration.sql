-- OCR foto KTP (penyedia eKYC "paddleocr"): hasil perbandingan NIK di foto
-- dengan NIK ketikan, NIK yang terbaca (dihapus saat diputuskan, seperti nik),
-- dan skor bacanya — lencana untuk petugas di /admin/verifikasi. Semuanya
-- tambahan; tidak ada kolom lama yang diubah atau dibuang.

-- AlterTable
ALTER TABLE `mobile_ktp_verifications` ADD COLUMN `ocr_nik` VARCHAR(16) NULL,
    ADD COLUMN `ocr_result` ENUM('cocok', 'beda', 'tak_terbaca', 'gagal') NULL,
    ADD COLUMN `ocr_score` DOUBLE NULL;
