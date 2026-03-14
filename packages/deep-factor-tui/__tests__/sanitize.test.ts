import { escapeXml } from "deep-factor-agent";
import { describe, expect, it } from "vitest";
import { decodeXmlEntities } from "../src/sanitize.js";

describe("decodeXmlEntities", () => {
  it("decodes &lt; to <", () => {
    expect(decodeXmlEntities("&lt;div&gt;")).toBe("<div>");
  });

  it("decodes &gt; to >", () => {
    expect(decodeXmlEntities("a &gt; b")).toBe("a > b");
  });

  it("decodes &amp; to &", () => {
    expect(decodeXmlEntities("a &amp; b")).toBe("a & b");
  });

  it("decodes &apos; to '", () => {
    expect(decodeXmlEntities("it&apos;s")).toBe("it's");
  });

  it('decodes &quot; to "', () => {
    expect(decodeXmlEntities("say &quot;hello&quot;")).toBe('say "hello"');
  });

  it("decodes all five entities in one string", () => {
    expect(decodeXmlEntities("&lt;p class=&quot;x&quot;&gt;a &amp; b&apos;s&lt;/p&gt;")).toBe(
      `<p class="x">a & b's</p>`,
    );
  });

  it("round-trips with escapeXml()", () => {
    const original = `<div class="test">it's a & b</div>`;
    expect(decodeXmlEntities(escapeXml(original))).toBe(original);
  });

  it("does not double-decode (&amp;lt; becomes &lt; not <)", () => {
    expect(decodeXmlEntities("&amp;lt;")).toBe("&lt;");
  });

  it("does not double-decode (&amp;amp; becomes &amp; not empty)", () => {
    expect(decodeXmlEntities("&amp;amp;")).toBe("&amp;");
  });

  it("passes through clean text without entities unchanged", () => {
    const clean = "Hello, world! No entities here.";
    expect(decodeXmlEntities(clean)).toBe(clean);
  });

  it("passes through empty string", () => {
    expect(decodeXmlEntities("")).toBe("");
  });
});
