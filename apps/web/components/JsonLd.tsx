// Renders a JSON-LD structured-data block into the server-rendered HTML so
// search engines and AI answer engines can read it. Per the Next.js JSON-LD
// guide a native <script type="application/ld+json"> is the correct tag (the
// data is structured content, not executable code), and every "<" is escaped
// to < to defuse any HTML/XSS injection from the serialized values.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
