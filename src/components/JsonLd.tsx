/**
 * One block of structured data.
 *
 * `JSON.stringify` output is injected as-is. That is safe here and only here: every value comes
 * from `config.ts` or from the site's own copy, never from a creator's bio or anything else a
 * stranger can type. If that ever stops being true, escape `<` before it goes in.
 */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
