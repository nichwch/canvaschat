const TAILWIND_CDN = "https://cdn.tailwindcss.com";
const TAILWIND_TAG = `<script src="${TAILWIND_CDN}"></script>`;

/**
 * Tailwind is available in every preview, whether or not the model asked for it,
 * so generated documents can use utility classes without boilerplate.
 */
export function withTailwind(html: string): string {
  if (/<script[^>]+tailwind/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (head) => head + TAILWIND_TAG);
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${TAILWIND_TAG}</head>`);
  }
  return TAILWIND_TAG + html;
}
