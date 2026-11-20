"use client";
// Picking a profile photo: choose a file, see it before it goes, send it.
//
// The photo is squared off and shrunk in the browser first. A phone photo is several megabytes and
// many times larger than anything shown at avatar size, so sending the original would be slow on a
// phone connection for no gain — and Vercel refuses a request body over 4.5 MB, which a modern
// camera photo can reach on its own. The server checks the size again either way.
import { useEffect, useRef, useState } from "react";

/** Same list the upload route accepts. PDFs are not a profile photo. */
const ACCEPT = "image/jpeg,image/png,image/webp";
export const MAX_PHOTO_MB = 1;

/** Side of the square the photo is cut down to. Avatars are shown at 72px at the very largest. */
const EDGE = 512;

/**
 * Centre-crops to a square and re-draws at `EDGE`, as a JPEG.
 *
 * Cropping here rather than in CSS means what the creator sees in the preview is exactly what
 * everyone else gets. If anything fails — an image the browser can't decode — the original is
 * returned and the server's own limits decide.
 */
export async function squareShrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const edge = Math.min(EDGE, side);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = edge;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, edge, edge);
    bitmap.close();
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * The file input and a preview of what was chosen.
 *
 * The preview URL is made with `createObjectURL` and released when it changes or the picker goes
 * away, so choosing six photos in a row doesn't leave six copies in memory.
 */
export function PhotoPicker({ file, onPick, busy }: { file: File | null; onPick: (f: File | null) => void; busy?: boolean }) {
  const [working, setWorking] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function picked(chosen: File | null) {
    if (!chosen) return onPick(null);
    setWorking(true);
    try {
      onPick(await squareShrink(chosen));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Your new profile photo" className="avatar avatar-lg" style={{ objectFit: "cover" }} />
      ) : null}
      <div className="stack grow" style={{ gap: 4, minWidth: 200 }}>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="input"
          disabled={busy || working}
          style={{ paddingTop: 12, paddingBottom: 12, height: "auto" }}
          onChange={(e) => void picked(e.target.files?.[0] ?? null)}
        />
        <span className="small muted">
          {working ? "Getting it ready…" : "A clear photo of your face. JPG, PNG or WEBP — it’s cut to a square for you."}
        </span>
      </div>
    </div>
  );
}
