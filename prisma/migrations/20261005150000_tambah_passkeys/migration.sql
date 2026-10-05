-- CreateTable
CREATE TABLE `passkeys` (
    `id` VARCHAR(255) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `public_key` BLOB NOT NULL,
    `counter` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `transports` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_used_at` TIMESTAMP(0) NULL,

    INDEX `passkeys_user_id_foreign`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `passkeys` ADD CONSTRAINT `passkeys_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

