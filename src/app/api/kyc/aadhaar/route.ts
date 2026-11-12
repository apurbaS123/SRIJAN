// A creator sends in both sides of their Aadhaar for the Srijan team to check.
//
// Sent as multipart form data, not JSON: these are photos, and base64 in a JSON body would be a
// third larger and would have to be held in memory as one long string first.
//
// The order matters. The files are read and saved to the document store *before* the database is
// locked, because `withDb` holds a lock for the length of the request and nothing slow belongs
// inside it. If the record then fails to save, the files just written are deleted again, so a
// refused submission can't leave documents behind that nothing points at.
import { NextResponse } from "next/server";
import { api, signedInUserId } from "@/lib/server/api";
import { sendOpsAlerts } from "@/lib/server/alerts";
import { readAadhaarNumber } from "@/lib/server/aadhaar";
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, deleteDocuments, putDocument, type DocumentKind } from "@/lib/server/uploads";
import { limitByIp } from "@/lib/server/rateLimit";
import { kycSummary, submitAadhaar } from "@/lib/domain/kyc";
import { creatorPublic } from "@/lib/domain/views";
import { payoutSummary } from "@/lib/domain/creators";
import { DomainError } from "@/lib/domain/util";
import type { UploadRef } from "@/lib/domain/types";

const MAX_MB = MAX_DOCUMENT_BYTES / (1024 * 1024);

const SIDES: { field: string; kind: DocumentKind; label: string }[] = [
  { field: "front", kind: "aadhaar_front", label: "the front of your Aadhaar" },
  { field: "back", kind: "aadhaar_back", label: "the back of your Aadhaar" },
];

/** One uploaded side, checked before a byte of it is kept. */
function readFile(form: FormData, field: string, label: string) {
  const f = form.get(field);
  if (!(f instanceof File) || f.size === 0) throw new DomainError(`Add a photo of ${label}`);
  if (f.size > MAX_DOCUMENT_BYTES) throw new DomainError(`That photo of ${label} is too large — keep each one under ${MAX_MB} MB`);
  if (!(DOCUMENT_TYPES as readonly string[]).includes(f.type)) throw new DomainError(`Upload ${label} as a JPG, PNG, WEBP or PDF`);
  return f;
}

export async function POST(req: Request) {
  // Uploads are heavy, and a creator only ever does this once or twice.
  const limited = await limitByIp("kyc-upload", 10, 60 * 60_000);
  if (limited) return limited;
  // Who the files belong to, before anything is written. The role is checked again inside `api`.
  const userId = await signedInUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Please sign in first" }, { status: 401 });

  let saved: UploadRef[] = [];
  try {
    const form = await req.formData().catch(() => {
      throw new DomainError("That didn’t upload properly. Please try again.");
    });
    const number = readAadhaarNumber(form.get("number"));
    const name = String(form.get("name") ?? "");
    const sides = SIDES.map((s) => ({ ...s, file: readFile(form, s.field, s.label) }));

    for (const { file, kind } of sides) {
      saved.push(await putDocument(Buffer.from(await file.arrayBuffer()), file.type, { ownerId: userId, kind }));
    }
    const [front, back] = saved;

    // Filled in once the record is saved, then emailed after the reply has gone out: nothing in
    // this queue is worth making the creator wait on an email server.
    let alert: string[] | undefined;
    const res = await api(
      ({ db, now, user }) => {
        const { creator, replaced, duplicate } = submitAadhaar(db, user!.creatorId!, { name, last4: number.last4, numberHash: number.numberHash, front: front!, back: back! }, now);
        // Nothing points at the photos this set replaced any more.
        if (replaced.length) void deleteDocuments(replaced.map((r) => r.id));
        alert = [
          `${creator.name} has sent in their Aadhaar to be verified.`,
          `Name on the card: ${creator.kyc.aadhaarDoc!.name} · Aadhaar •••• ${number.last4}`,
          duplicate ? "⚠ The same Aadhaar is already on another creator account — check both before approving." : "",
          "Open Creators on the ops page to read it and approve or send it back.",
        ].filter(Boolean);
        return { ...creatorPublic(creator), payout: payoutSummary(creator), kyc: kycSummary(creator) };
      },
      { role: "creator" },
    );
    if (res.status === 200 && alert) sendOpsAlerts([alert]);
    // Saved: these files are part of the creator's record now, so leave them alone below.
    if (res.status === 200) saved = [];
    return res;
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  } finally {
    // Anything still listed here never made it onto a creator, so nobody could ever reach it.
    if (saved.length) void deleteDocuments(saved.map((r) => r.id));
  }
}
