// The document store: identity documents creators upload, kept apart from everything else.
//
// These are photos of people's Aadhaar cards, so two rules shape this file.
//
// First, they never go in the marketplace data. Every request loads the whole `DB` object (see
// ./store.ts), so a few megabytes of JPEG on a creator's record would be read and written on every
// page view by everyone. The creator's record keeps only an `UploadRef` — an id, a type and a size
// — and the bytes live here, fetched one at a time and only when somebody opens one.
//
// Second, nothing here is reachable from a URL anyone can guess their way to. There is no public
// path and no signed link: the only way in is /api/kyc/document/<id>, which checks that the person
// asking is on the Srijan team or is the creator who uploaded it.
//
// Where the bytes go follows ./store.ts exactly:
//   - with DATABASE_URL or POSTGRES_URL: a `srijan.documents` table, in the same schema Supabase's
//     public REST API doesn't expose, with row level security and no policies on top.
//   - otherwise: files under `.data/uploads` (local development and tests).
import fs from "node:fs/promises";
import path from "node:path";
import type { UploadRef } from "@/lib/domain/types";
import { newId } from "@/lib/domain/util";
import { storeSql } from "./store";

/**
 * What a creator may upload as an identity document, and how big it may be.
 *
 * Two of these go up in one request, and Vercel refuses a request body over 4.5 MB, so the limit
 * is per file and well under half of that. Phone photos are routinely bigger than this, which is
 * why the browser shrinks them before they are sent (see `components/AadhaarFields.tsx`) — a photo
 * of a card doesn't need more, and a creator should never be told to find a smaller one.
 */
export const DOCUMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

export type DocumentKind = "aadhaar_front" | "aadhaar_back";

export interface StoredDocument {
  bytes: Buffer;
  mime: string;
}

const DIR = process.env.SRIJAN_UPLOAD_DIR || path.join(process.cwd(), ".data", "uploads");

let schema: Promise<void> | undefined;

/** Creates the documents table on first use, the same way ./pg.ts does for the rest. */
function ensureSchema(sql: NonNullable<ReturnType<typeof storeSql>>) {
  schema ??= sql
    .begin(async (tx) => {
      // Several server copies may start at once: let one set up while the others wait, the same
      // way ./pg.ts does for the marketplace tables.
      await tx`select pg_advisory_xact_lock(724111)`;
      await tx`create schema if not exists srijan`;
      await tx`create table if not exists srijan.documents (
        id text primary key,
        owner_id text not null,
        kind text not null,
        mime text not null,
        size integer not null,
        uploaded_at timestamptz not null default now(),
        bytes bytea not null
      )`;
      await tx`alter table srijan.documents enable row level security`;
    })
    .then(() => undefined)
    .catch((e) => {
      schema = undefined;
      throw e;
    });
  return schema;
}

/**
 * Saves one document and returns the record to put on the creator — never the bytes. The id is
 * unguessable, so it gives nothing away even if it is seen; it is not what keeps the file private.
 */
export async function putDocument(bytes: Buffer, mime: string, owner: { ownerId: string; kind: DocumentKind }): Promise<UploadRef> {
  const ref: UploadRef = { id: newId("doc"), mime, size: bytes.byteLength, uploadedAt: Date.now() };
  const sql = storeSql();
  if (sql) {
    await ensureSchema(sql);
    await sql`insert into srijan.documents (id, owner_id, kind, mime, size, bytes)
              values (${ref.id}, ${owner.ownerId}, ${owner.kind}, ${mime}, ${ref.size}, ${bytes})`;
  } else {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, `${ref.id}.bin`), bytes);
    await fs.writeFile(path.join(DIR, `${ref.id}.json`), JSON.stringify({ ...ref, ...owner }));
  }
  return ref;
}

/** One document's bytes, or null if it isn't there. The caller has already decided who may see it. */
export async function getDocument(id: string): Promise<StoredDocument | null> {
  if (!/^doc_[a-z0-9]{1,40}$/i.test(id)) return null;
  const sql = storeSql();
  if (sql) {
    await ensureSchema(sql);
    const [row] = await sql`select mime, bytes from srijan.documents where id = ${id}`;
    return row ? { bytes: Buffer.from(row.bytes as Buffer), mime: String(row.mime) } : null;
  }
  try {
    const [bytes, meta] = await Promise.all([fs.readFile(path.join(DIR, `${id}.bin`)), fs.readFile(path.join(DIR, `${id}.json`), "utf8")]);
    return { bytes, mime: String((JSON.parse(meta) as UploadRef).mime || "application/octet-stream") };
  } catch {
    return null;
  }
}

/**
 * Throws away documents nothing points at any more — the old photos when a creator uploads a
 * clearer set. Failing to delete one is never worth failing the request that replaced it, so this
 * swallows its errors; the worst case is a file nobody can reach taking up room.
 */
export async function deleteDocuments(ids: string[]) {
  if (!ids.length) return;
  try {
    const sql = storeSql();
    if (sql) {
      await ensureSchema(sql);
      await sql`delete from srijan.documents where id in ${sql(ids)}`;
      return;
    }
    await Promise.all(ids.flatMap((id) => [fs.rm(path.join(DIR, `${id}.bin`), { force: true }), fs.rm(path.join(DIR, `${id}.json`), { force: true })]));
  } catch (e) {
    console.error("Could not delete replaced documents", e);
  }
}
