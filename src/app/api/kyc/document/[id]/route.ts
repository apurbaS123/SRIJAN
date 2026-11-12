// Looking at an uploaded identity document.
//
// This route is the only way to reach one, so it is the thing that keeps them private. Two people
// may open a document: somebody on the Srijan team, who has to read the Aadhaar to approve the
// creator, and the creator who uploaded it, so they can see what they sent. Everybody else gets a
// 404 — not a 403, which would at least confirm the document exists.
//
// It replies with the image itself rather than JSON, so it doesn't use the `api` wrapper.
import { NextResponse } from "next/server";
import { signedInUserId } from "@/lib/server/api";
import { getDocument } from "@/lib/server/uploads";
import { isOpsEmail, normalizeEmail } from "@/lib/server/env";
import { withDb } from "@/lib/server/store";
import { aadhaarUploadIds } from "@/lib/domain/kyc";

const notFound = () => new NextResponse("Not found", { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await signedInUserId();
  if (!userId) return notFound();

  // Who is asking, and whether this particular document is theirs to see.
  const { result: allowed } = await withDb((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user) return false;
    if (user.role === "ops" && isOpsEmail(normalizeEmail(user.email))) return true;
    const creator = user.creatorId ? db.creators.find((c) => c.id === user.creatorId) : undefined;
    return !!creator && aadhaarUploadIds(creator).includes(id);
  });
  if (!allowed) return notFound();

  const doc = await getDocument(id);
  if (!doc) return notFound();
  return new NextResponse(new Uint8Array(doc.bytes), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Length": String(doc.bytes.byteLength),
      // Someone else's identity document must never sit in a shared cache, and a signed-out
      // browser must not be able to show it again from its own.
      "Cache-Control": "private, no-store",
      // Shown in the page, never run by it: an uploaded file is not to be trusted as a document.
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${id}"`,
    },
  });
}
