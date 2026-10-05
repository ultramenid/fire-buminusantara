import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { ISI, KopPanel, Kartu, Hampa } from "../ruang";
import { TombolHapusPasskey, TombolTambahPasskey } from "../tombol-passkey";
import { Ikon } from "../menu-admin";

const tanggalId = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });

const NAMA_JALUR: Record<string, string> = {
  internal: "Perangkat ini (Touch ID / Face ID / Windows Hello)",
  hybrid: "Ponsel (QR Code)",
  usb: "Kunci Pengaman USB",
  nfc: "NFC",
  ble: "Bluetooth",
};

/** Passkey milik akun yang sedang masuk — tiap orang mengelola miliknya sendiri. */
export default async function Biometrik() {
  const sesi = await wajibSesi();
  const daftar = await prisma.passkeys.findMany({
    where: { user_id: sesi.id },
    orderBy: { created_at: "desc" },
    select: { id: true, transports: true, created_at: true, last_used_at: true },
  });

  return (
    <>
      <KopPanel
        mata="Pengaturan akun"
        judul="Biometrik & Passkey"
        deskripsi="Masuk cepat dan aman tanpa mengetik kata sandi menggunakan sidik jari, wajah, atau PIN perangkat."
      >
        <TombolTambahPasskey />
      </KopPanel>

      <div className={ISI}>
        <div className="grid gap-6">
          {daftar.length === 0 ? (
            <Kartu>
              <div className="py-8">
                <Hampa judul="Belum ada passkey yang terdaftar" ikon="kunci">
                  Daftarkan perangkat ini sekali, lalu Anda bisa masuk dengan sensor sidik jari atau pengenalan wajah.
                </Hampa>
              </div>
            </Kartu>
          ) : (
            <Kartu
              judul="Daftar Perangkat Terdaftar"
              deskripsi={`${daftar.length} passkey aktif untuk akun Anda.`}
              isi=""
            >
              <ul className="divide-y divide-[var(--garis)]">
                {daftar.map((p) => {
                  const labelJalur =
                    p.transports?.split(",").map((t) => NAMA_JALUR[t] ?? t).join(" · ") ||
                    "Passkey Perangkat";

                  return (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-[var(--papan)]"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--jari)] border border-[var(--garis)] bg-[var(--papan)] text-[var(--redup)]">
                          <Ikon nama="kunci" className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-semibold text-[var(--jelaga)]">
                            {labelJalur}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--lirih)]">
                            <span>
                              Didaftarkan:{" "}
                              <strong className="font-medium text-[var(--redup)]">
                                {tanggalId.format(p.created_at)}
                              </strong>
                            </span>
                            <span>•</span>
                            <span>
                              {p.last_used_at ? (
                                <>
                                  Terakhir dipakai:{" "}
                                  <strong className="font-medium text-[var(--redup)]">
                                    {tanggalId.format(p.last_used_at)}
                                  </strong>
                                </>
                              ) : (
                                "Belum pernah digunakan"
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      <TombolHapusPasskey id={p.id} />
                    </li>
                  );
                })}
              </ul>
            </Kartu>
          )}

          {/* Info keamanan */}
          <Kartu
            judul="Tentang Keamanan Passkey (FIDO2 / WebAuthn)"
            className="border-[var(--garis)] bg-[var(--papan)]"
          >
            <p className="text-[13px] leading-[1.6] text-[var(--redup)]">
              Passkey memanfaatkan teknologi enkripsi asimetris standar WebAuthn. Data biometrik (sidik jari atau wajah) Anda sepenuhnya berada di dalam chip aman (secure enclave) perangkat pribadi dan tidak pernah dikirim ke server. Server hanya menyimpan kunci publik untuk memvalidasi tanda tangan digital setiap kali Anda masuk.
            </p>
          </Kartu>
        </div>
      </div>
    </>
  );
}
