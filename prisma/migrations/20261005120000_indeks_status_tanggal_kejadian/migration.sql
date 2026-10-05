-- Indeks ini dideklarasikan di schema.prisma oleh refaktor 4da860b tanpa
-- migrasi pendamping.
CREATE INDEX `events_status_event_date_index` ON `events`(`status`, `event_date` DESC);
