# CMS & report form — audit fix plan

Source: audit on 2026-10-05 after the `image_en` Verifikasi incident.
Tick `[x]` when an item is done (code + `tsc` + `eslint` + `npm test` pass). Add the commit sha once committed.
Work top to bottom; each phase is independently shippable.

## Phase 0 — incident (done)

- [x] Verifikasi failed: `image_en` sent to `events.create` — `b49c584`
- [x] Deploy failed: server's stored GHCR login expired → workflow logs in each deploy with `GITHUB_TOKEN` — `f873dc0`

## Phase 1 — stop silent breakage (today)

- [x] 1.1 Captcha deadlock: tapping Kirim before the Turnstile token arrives sets `sedangKirimRef` and then `requestSubmit()` is blocked by the same guard → form dead until reload.
      `app/[locale]/lapor/form-laporan.tsx:432`, `components/landing-karhutla/komposer-lapor.tsx:455`
- [x] 1.2 Never show raw Prisma/JS errors; log them server-side instead.
      `lib/simpan-kejadian.ts` (simpanKejadian + promosiKeKejadian catches), `lib/laporan-publik.ts` (simpanLaporanPublik + ubahStatus catches)
- [x] 1.3 `app/admin/error.tsx` so a thrown action error doesn't replace the whole CMS with the global error page.
- [x] 1.4 Type every Prisma payload built as a variable (`satisfies Prisma.…Input`) so `tsc` catches removed/renamed columns.
      `lib/simpan-kejadian.ts:214` (`isi`), `:360` (`dataKejadian`), `lib/statistik-sorotan.ts:76`
- [x] 1.5 Slug retry: match `P2002` error code, not `msg.includes("slug")` (validation errors contain "slug" too).
      `lib/simpan-kejadian.ts:248,394`

Phase 1 notes:
- 1.1 was worse than audited: the deferred `requestSubmit()` also ran the *stale* `onSubmit` (`menungguToken=true`) with an empty hidden `captcha` input. Fixed by releasing the held submit from an effect after the token render (`kirimTertundaRef`). Not browser-tested — needs a Turnstile site key; verify on staging/prod by tapping Kirim right after the page opens.
- 1.2 also covers `lib/unggah.ts` (raw MinIO message). Promotion failures keep their friendly text via `GagalPromosi`.
- 1.4 verified: re-adding `image_en: null` now fails `tsc` with TS2353.

## Phase 2 — data quality & lost input (this week)

- [x] 2.1 Reports without location become events at `0,0` → store `null` (check `events.location_lat` nullability first) or block Verifikasi until curator sets one. `lib/simpan-kejadian.ts:321`
- [x] 2.2 Treat EXIF/photo GPS `0,0` as "no GPS". `lib/unggah.ts:473`, `form-laporan.tsx:309`
- [x] 2.3 Accept comma decimals in lat/lng (`-1,234`) and validate range in the browser before upload. `lib/laporan-publik.ts:114`
- [x] 2.4 Rejected file pick (over 6 files / 100 MB) leaves rejected files in the `<input>` → re-sync input before early return. `form-laporan.tsx:260`, `landing-karhutla/komposer-lapor.tsx:256`
- [x] 2.5 Network drop mid-submit unmounts `/lapor` form → catch in the action reducer, return an offline message; reuse `lib/draf-lapor.ts` draft. `form-laporan.tsx:122`
- [x] 2.6 Landing composer: second report after "Tulis lagi" reuses a spent captcha token → reset widget/token on success. `landing-karhutla/komposer-lapor.tsx:119,332`
- [x] 2.7 CMS edits wiped on failed save (uncontrolled `defaultValue` + React 19 form reset). `app/admin/laporan/sunting-laporan.tsx`, `app/admin/statistik/form-sorotan.tsx`
- [x] 2.8 Kejadian form: error via `?galat=` redirect at top of page, sticks in URL → `useActionState`, show error at save bar with `role="alert"`. `app/admin/kejadian/aksi.ts:28,42`
- [x] 2.9 Geocode inside the approval transaction (10s vs 5s tx timeout) → compute `lokasi`/slug before `$transaction` or raise timeout. `lib/laporan-publik.ts:511`

Phase 2 notes:
- 2.1 chose **block**, not null: `events.location_lat/lng` are NOT NULL and the DB is shared with the Laravel app. `promosiKeKejadian` now refuses reports without a point with a message telling the curator to set lat/lng in the report detail.
- 2.3 `koordinat()` moved to `lib/batas-laporan.ts` (import-free, shared by browser & server); also rejects manual `0,0`. Test: `lib/batas-laporan.test.ts`.
- 2.5 no draft needed: the `/lapor` inputs and file list are React state, so catching the thrown action keeps everything on screen. (A draft only helps across reloads — not done.)
- 2.6 `/lapor` unaffected (its "lapor lagi" reloads the page); only the landing composer needed the fix.
- 2.8 also removed the `?galat=` handling from `kejadian/baru` and `kejadian/[id]` pages. `DatePicker` keeps its own state, so it already survived the reset.
- 2.9 went with `{ timeout: 30_000 }` on the approval transaction (marked `ponytail:`), not a restructure.
- Not browser-tested yet (needs DB + Turnstile). Smoke test on staging/prod: Verifikasi a report with and without location; save a kejadian with an invalid field and check that the text stays; `/lapor` with airplane mode on mid-upload.

## Phase 3 — UX polish

Report form
- [x] 3.1 Show limits up front: "maks. 6 berkas, total 100 MB" in hint + error message with numbers. `lib/bahasa.ts:69`, `landing-karhutla/teks.ts:64`
- [x] 3.2 Location: warn (not block) before sending without a location; reword "opsional, kosongkan". `lib/bahasa.ts:74,109`
- [x] 3.3 Geolocation: different messages for denied vs timeout; retry once with `enableHighAccuracy:false, maximumAge:60000`.
- [x] 3.4 Server error messages localized via `bidang` code → `TEKS_LAPOR`; scroll/focus the field with the error.
- [x] 3.5 Captcha expiry on long uploads → **moved to 4.8** (done there) (needs a server-side pre-check, not a client fix).
- [x] 3.6 Landing composer: upload progress bar + total size; counter visible on mobile.
- [x] 3.7 Touch targets (remove-file `size-5` → `size-8`), `aria-label` "Hapus …", hardcoded "Foto/Video"/"Sedang mengirim" into `TEKS_LAPOR`.

CMS
- [x] 3.8 Success feedback: after Verifikasi show "Kejadian #id dibuat →"; after save/create user show a notice.
- [x] 3.9 Hapus kejadian double-submit: pass `useFormStatus().pending` as `sibuk`. `app/admin/kejadian/[id]/tombol-hapus.tsx`
- [x] 3.10 Login & Tambah pengguna: pending state on submit; pengguna errors without clearing fields.
- [x] 3.11 Fix copy that contradicts behaviour. `app/admin/laporan/page.tsx:55`, `app/admin/kejadian/page.tsx:90`
- [x] 3.12 Page past last page shows "Antrean kosong" → redirect to last valid page (laporan, komentar, kejadian).
- [x] 3.13 Two-step confirm: focus the "Ya, …" button, pause timer on focus/hover. `app/admin/tombol-konfirmasi.tsx`
- [x] 3.14 Komentar event filter: always include the selected event in options. `app/admin/komentar/page.tsx:16`
- [x] 3.15 Contrast: `--lirih` `#8d8c82` → ~`#6b6a60`. `app/admin/cms.css:29`
- [x] 3.16 Hide `PilihOrientasi` on locked reports. `app/admin/laporan/[id]/page.tsx:229`
- [x] 3.17 a11y: `role="alert"` on inline errors, `aria-label` on 🗑, combobox ARIA + "no results" in `cari-lokasi.tsx`.
- [x] 3.18 Statistik page uses CMS styles (`cms-tombol`, `Pemuat`, `cms-galat`).
- [x] 3.19 Mobile: hide/shrink login map panel under `sm`.

Phase 3 notes:
- 3.2 is a warning, not a block (warga without GPS can still report); label no longer says "opsional, kosongkan".
- 3.3 new `lib/posisi-gps.ts`: high-accuracy first, then one low-accuracy retry (`maximumAge: 60s`); denied vs weak-signal messages.
- 3.4 English visitors get messages mapped from the server's `bidang` code (`galatServerLapor` in `lib/bahasa.ts`); Indonesian keeps the more specific server text. Focus moves to the field. The offline message from 2.5 now goes through `galatKlien` so it isn't remapped.
- 3.6 landing composer: indeterminate `BilahUnggah` (no real %, see its `ponytail:` note) + total size on wide screens; "2/6" count now visible on phones.
- 3.8 new `.cms-kabar` success style. Verifikasi on the list → `?dibuat=<id>` banner with link; on the detail page a local notice. Kejadian list shows `?kabar=dibuat|disimpan|dihapus`; pengguna list `?kabar=dibuat`. TombolVerifikasi also catches thrown actions now.
- 3.10 new shared `app/admin/tombol-kirim.tsx` (useFormStatus). Tambah pengguna keeps nama/email/peran on error (never passwords).
- 3.13 also fixed: the countdown closed the confirm *while the action was running* (Verifikasi can exceed 5 s) — it now pauses while busy or hovered.
- 3.15 `--lirih` → `#6b6a60` (4.68:1 / 5.17:1); `--redup` darkened to `#57564d` so it stays the stronger of the two.
- 3.17 skipped full combobox ARIA in `cari-lokasi.tsx` (results are plain buttons, keyboard-reachable; a half combobox is worse than none) — added "no results" / "failed" status instead.
- Not browser-tested. Smoke test: Verifikasi from list (banner + link), Hapus kejadian (single delete + banner), login/tambah pengguna pending spinners, komentar filter with an old `?kejadian=`, `/en/lapor` with location denied.

## Phase 4 — reliability infrastructure

- [x] 4.1 `instrumentation.ts` with `onRequestError` → logs; route error logs to an alert channel (Uptime Kuma / monitoring/).
- [x] 4.2 CI job with MySQL service: `prisma migrate deploy`, `prisma migrate diff --exit-code` (schema vs migrations), one test each for `promosiKeKejadian` & `simpanKejadian`.
- [x] 4.3 Reconcile `image_en`: schema dropped it, migrations still have it → decide migration (DB shared with Laravel app — check first).
- [x] 4.4 Rate limit `kirimLaporan` and login per IP via `lib/redis.ts`.
- [x] 4.5 Runtime guards on admin actions (`status` enum, `Number.isSafeInteger(id)`); try/catch in `aksiTayang`, `aksiHapusKejadian`; `isNaN(Date.parse(tanggal))`.
- [x] 4.6 Media hygiene: log failed `hapusBerkas`; `hapusLaporan` also deletes poster & deletes row before files; event delete removes unshared media.
- [x] 4.8 Captcha expiry on long uploads (from 3.5): Turnstile tokens live 300 s but are verified only after the whole body (up to 100 MB) arrives. Verify the token in a small request first and hand back a short-lived signed ticket that `simpanLaporanPublik` accepts.
- [x] 4.7 Delete dead `components/komposer-lapor.tsx`; extract shared submit/captcha/file hook for `/lapor` and landing composer.

Phase 4 notes:
- 4.1 `lib/catat-galat.ts` (log + optional `ALERT_WEBHOOK_URL`, Slack/Discord-compatible, throttled 1×/5 min per label) used by the write-path catches and by root `instrumentation.ts` (`onRequestError`). **Action for you:** set `ALERT_WEBHOOK_URL` in `/srv/fire/.env` to get pinged.
- 4.2 new CI job `test-db` (MariaDB 11 service): `migrate deploy` → `migrate diff --exit-code` → `npm run test:db` (`lib/simpan-kejadian.dbtest.ts`, 3 tests). Verified locally: dropping `events.video` makes both write tests fail.
- 4.3 drift was bigger than `image_en`: also `events.location_geojson`, `comments.page_id`, `users.remember_token` (Laravel's) + `events_orientation_index` were missing from the schema, and `events_status_event_date_index` (added in 4da860b) had no migration. Fixed by declaring the legacy columns (nothing dropped from the shared DB) + migration `20261005120000_indeks_status_tanggal_kejadian` using `CREATE INDEX IF NOT EXISTS` (safe if prod already has it; verified re-run). `migrate diff` is now empty. Side effect: `image_en` is a valid field again, so the TS2353 demo from 1.4 no longer fires for that column (other removed columns still would).
- 4.4 `lib/batas-laju.ts`: Redis counter, in-memory fallback (`ponytail:` single container). Reports 5/10 min/IP (only when `TRUSTED_PROXY_HOPS` gives a trusted IP); login 10/15 min per IP and per email.
- 4.5 kept event-delete *not* removing media — the delete panel explicitly promises "Berkas medianya tetap tersimpan". `TombolTayang` now reads `{ok}` instead of relying on throws.
- 4.7 deleted the dead composer only. **Skipped** extracting a shared hook for `/lapor` + landing composer: every fix is now applied to both, and a refactor of two ~650-line forms without browser tests is more risk than it saves. Do it when the next cross-form change lands.
- 4.8 `lib/tiket-lapor.ts`: form trades the Turnstile token for a 30-min single-use HMAC ticket (`mintaTiketLapor`, small request) before the big upload. Server still accepts a raw `captcha` token for tabs opened before the deploy.
- Verified: `tsc`, eslint, `npm test` (66), `npm run test:db` (3), `next build --webpack` (scratchpad copy), `next start` smoke: `/admin/login`, `/id/lapor`, `/en/lapor`, `/admin/laporan` → 200 with the new copy.

## Still not done
- Browser walk-through of the interactive flows (Verifikasi banner, two-step confirm focus/pausing, captcha deferred submit, offline message, rate-limit messages). Needs a real browser + Turnstile key — do on staging/prod after deploy.
- Shared composer hook (see 4.7).
