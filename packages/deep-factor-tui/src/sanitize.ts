/**
 * Decodes XML entities back to their literal characters.
 *
 * Handles all five standard XML entities: &lt; &gt; &amp; &apos; &quot;
 * Decodes &amp; last to prevent double-decoding (e.g., &amp;lt; -> &lt; not <).
 */
export function decodeXmlEntities(text: string): string {
  if (!text.includes("&")) return text;

  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}
