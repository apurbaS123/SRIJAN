"use client";
// The Aadhaar a creator sends to the Srijan team: the name and number on the card, and a photo of
// each side. Shared by /join, where it is part of signing up, and /creator/kyc, where a creator who
// was asked for clearer photos sends them again.
//
// It holds the two files in the browser and hands them to the parent, which does the upload. The
// same checks run again on the server — these are only here so a creator finds out now rather than
// after waiting for the upload.
import { useId, useState } from "react";

/** Each side of the card, as it sits in the form before it is sent. */
export interface AadhaarDraft {
  name: string;
  number: string;
  front: File | null;
  back: File | null;
}

export const EMPTY_AADHAAR: AadhaarDraft = { name: "", number: "", front: null, back: null };

/** Same list the upload route accepts, and the same limit. */
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
export const MAX_FILE_MB = 2;

/**
 * Longest side a shrunk photo keeps. An Aadhaar card at 1600px across is far more than enough to
 * read every digit on it, and it is what makes the 2 MB limit a limit nobody meets: phones take
 * photos several times that size, and being told to go and find a smaller one is not something to
 * put in front of somebody signing up.
 */
const MAX_EDGE = 1600;

/**
 * Re-draws an image at a sensible size and sends it as a JPEG. PDFs and anything that can't be
 * decoded are left exactly as they are — the server checks the size again either way, so the worst
 * a failure here causes is the message the creator would have got anyway.
 */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    // Already small in both senses: leave the original alone rather than re-encode it.
    if (scale === 1 && file.size <= MAX_FILE_MB * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export const aadhaarDigits = (v: string) => v.replace(/\D/g, "").slice(0, 12);

/** Everything filled in? The parent uses this to decide whether its button is pressable. */
const fits = (f: File | null) => !!f && f.size <= MAX_FILE_MB * 1024 * 1024;

export function aadhaarReady(d: AadhaarDraft) {
  return d.name.trim().length >= 2 && aadhaarDigits(d.number).length === 12 && fits(d.front) && fits(d.back);
}

/** The draft as the upload route wants it. */
export function aadhaarForm(d: AadhaarDraft) {
  const form = new FormData();
  form.set("name", d.name.trim());
  form.set("number", aadhaarDigits(d.number));
  if (d.front) form.set("front", d.front);
  if (d.back) form.set("back", d.back);
  return form;
}

/** "1.4 MB" */
const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** One side of the card: pick a file, see what was picked, swap it for another. */
function FilePick({ label, hint, file, onPick }: { label: string; hint: string; file: File | null; onPick: (f: File | null) => void }) {
  const id = useId();
  const [working, setWorking] = useState(false);
  const tooBig = !!file && file.size > MAX_FILE_MB * 1024 * 1024;

  async function picked(chosen: File | null) {
    if (!chosen) return onPick(null);
    setWorking(true);
    try {
      onPick(await shrink(chosen));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept={ACCEPT}
        className="input"
        style={{ paddingTop: 12, paddingBottom: 12, height: "auto" }}
        onChange={(e) => void picked(e.target.files?.[0] ?? null)}
      />
      {working ? (
        <span className="small muted">Getting it ready…</span>
      ) : file ? (
        <span className={`small ${tooBig ? "field-reminder" : "muted"}`}>
          {file.name} · {mb(file.size)}
          {tooBig ? ` — too large, keep it under ${MAX_FILE_MB} MB` : ""}
        </span>
      ) : (
        <span className="small muted">{hint}</span>
      )}
    </div>
  );
}

export function AadhaarFields({ value, onChange, disabled }: { value: AadhaarDraft; onChange: (d: AadhaarDraft) => void; disabled?: boolean }) {
  const set = (patch: Partial<AadhaarDraft>) => onChange({ ...value, ...patch });
  const digits = aadhaarDigits(value.number);
  const shortNumber = digits.length > 0 && digits.length < 12;
  return (
    <fieldset className="stack" disabled={disabled} style={{ border: 0, padding: 0, margin: 0, gap: 16, display: "flex", flexDirection: "column" }}>
      <div className="field">
        <label htmlFor="aadhaar-name">Name exactly as printed on your Aadhaar</label>
        <input id="aadhaar-name" className="input" value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Mitali Rani Deka" />
        <span className="small muted">Including any middle name. If it doesn’t match your profile name, the team will check with you.</span>
      </div>
      <div className="field">
        <label htmlFor="aadhaar-number">Aadhaar number</label>
        <input
          id="aadhaar-number"
          className={`input${shortNumber ? " invalid" : ""}`}
          inputMode="numeric"
          autoComplete="off"
          value={digits.replace(/(\d{4})(?=\d)/g, "$1 ")}
          onChange={(e) => set({ number: aadhaarDigits(e.target.value) })}
          placeholder="1234 5678 9012"
        />
        <span className="small muted">Srijan keeps only the last 4 digits. The full number is never stored and never shown to anyone.</span>
      </div>
      <FilePick label="Photo of the front" hint="The side with your photo and name. JPG, PNG, WEBP or PDF." file={value.front} onPick={(f) => set({ front: f })} />
      <FilePick label="Photo of the back" hint="The side with your address. Make sure the number is readable." file={value.back} onPick={(f) => set({ back: f })} />
    </fieldset>
  );
}
