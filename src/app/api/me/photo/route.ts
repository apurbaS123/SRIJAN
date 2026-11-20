// A creator adds, changes or removes their own profile photo.
//
// Same shape as the Aadhaar upload next door (see /api/kyc/aadhaar): the file is read and saved to
// the document store *before* the database is locked, because `withDb` holds that lock for the
// length of the request. If the record then fails to save, the file just written is deleted again,
// so a refused upload can't leave a file behind that nothing points at.
//
// The photo this one replaces is deleted too, after the reply has gone out.
import { NextResponse } from "next/server";
import { api, signedInUserId } from "@/lib/server/api";
import { AVATAR_TYPES, MAX_AVATAR_BYTES, deleteDocuments, putDocument } from "@/lib/server/uploads";
import { limitByIp } from "@/lib/server/rateLimit";
import { clearCreatorPhoto, payoutSummary, setCreatorPhoto } from "@/lib/domain/creators";
import { kycSummary } from "@/lib/domain/kyc";
import { creatorPublic } from "@/lib/domain/views";
import { DomainError } from "@/lib/domain/util";
import type { UploadRef } from "@/lib/domain/types";

const MAX_MB = MAX_AVATAR_BYTES / (1024 * 1024);

export async function POST(req: Request) {
  const limited = await limitByIp("photo-upload", 20, 60 * 60_000);
  if (limited) return limited;
  const userId = await signedInUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Please sign in first" }, { status: 401 });

  let saved: UploadRef | undefined;
  try {
    const form = await req.formData().catch(() => {
      throw new DomainError("That didn’t upload properly. Please try again.");
    });
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("Choose a photo first");
    if (file.size > MAX_AVATAR_BYTES) throw new DomainError(`That photo is too large — keep it under ${MAX_MB} MB`);
    if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) throw new DomainError("Upload a JPG, PNG or WEBP");

    saved = await putDocument(Buffer.from(await file.arrayBuffer()), file.type, { ownerId: userId, kind: "avatar" });
    let orphaned: string[] = [];
    const res = await api(
      ({ db, user }) => {
        const out = setCreatorPhoto(db, user!.creatorId!, saved!);
        orphaned = out.orphaned;
        return { ...creatorPublic(out.creator), payout: payoutSummary(out.creator), kyc: kycSummary(out.creator) };
      },
      { role: "creator" },
    );
    if (res.status === 200) {
      // It belongs to the creator now; the old one is what should go instead.
      saved = undefined;
      if (orphaned.length) void deleteDocuments(orphaned);
    }
    return res;
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  } finally {
    if (saved) void deleteDocuments([saved.id]);
  }
}

export async function DELETE() {
  let orphaned: string[] = [];
  const res = await api(
    ({ db, user }) => {
      const out = clearCreatorPhoto(db, user!.creatorId!);
      orphaned = out.orphaned;
      return { ...creatorPublic(out.creator), payout: payoutSummary(out.creator), kyc: kycSummary(out.creator) };
    },
    { role: "creator" },
  );
  if (res.status === 200 && orphaned.length) void deleteDocuments(orphaned);
  return res;
}
