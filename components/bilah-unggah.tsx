"use client";

/**
 * Bilah kemajuan untuk pengiriman form yang membawa berkas.
 *
 * ponytail: server action tidak melaporkan byte yang terkirim, jadi bilahnya
 * bergeser terus (indeterminate), bukan persentase. Kalau persentase betul
 * dibutuhkan, unggah berkasnya lewat endpoint XHR sendiri (xhr.upload.onprogress)
 * sebelum form diserahkan.
 */
export function BilahUnggah({ className = "", label = "Sedang mengirim" }: { className?: string; label?: string } = {}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/20 ${className}`}
      style={{ height: 3 }}
    >
      <div
        className="bilah-unggah-bar rounded-full bg-current"
        style={{
          height: "100%",
          width: "40%",
          animation: "bilah-unggah 1.2s ease-in-out infinite",
          willChange: "transform",
        }}
      />
    </div>
  );
}