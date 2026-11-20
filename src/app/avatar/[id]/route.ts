// A creator's profile photo.
//
// This is the one upload on Srijan that anybody may look at, and it sits deliberately apart from
// /api/kyc/document/<id>, which serves identity documents and checks who is asking. Two separate
// checks keep an Aadhaar from ever coming out of here:
//
// It lives outside /api on purpose. next.config.ts puts `Cache-Control: no-store` on everything
// under /api, because those replies carry personal data — this one is public and never changes, so
// it wants the opposite, and carving an exception out of that rule is not worth the risk of
// getting it slightly wrong.
//
//   1. the id must be the photo currently on some creator's profile, and
//   2. the stored file must have been saved as an "avatar".
//
// An Aadhaar fails both. Either alone would do; both are cheap.
import { NextResponse } from "next/server";
import { getDocument } from "@/lib/server/uploads";
import { withDb } from "@/lib/server/store";

const notFound = () => new NextResponse("Not found", { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { result: isProfilePhoto } = await withDb((db) => db.creators.some((c) => c.photo?.id === id));
  if (!isProfilePhoto) return notFound();

  const doc = await getDocument(id);
  if (!doc || doc.kind !== "avatar") return notFound();
  return new NextResponse(new Uint8Array(doc.bytes), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Length": String(doc.bytes.byteLength),
      // Public and safe to cache: the id changes whenever the creator uploads a new photo, so a
      // cached copy can never be the wrong one.
      "Cache-Control": "public, max-age=31536000, immutable",
      // Shown in the page, never run by it: an uploaded file is not to be trusted as a document.
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${id}"`,
    },
  });
}
