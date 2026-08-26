// F-24 FE-6/F7 — inline JSON-LD. Server component: it renders a <script> tag, never runs.
//
// `JSON.stringify` is not an HTML sink on its own, but the string still has to escape `<` so a
// value like "</script>" inside user-authored copy (a synopsis, a bio) cannot close the tag early.
export default function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
