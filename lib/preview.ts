const TAILWIND_CDN = "https://cdn.tailwindcss.com";
const TAILWIND_TAG = `<script src="${TAILWIND_CDN}"></script>`;

/** Inserts a tag as early as possible so it runs before the document's own scripts. */
export function injectHead(html: string, tag: string): string {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (head) => head + tag);
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (open) => `${open}<head>${tag}</head>`);
  }
  return tag + html;
}

/**
 * Tailwind is available in every preview, whether or not the model asked for it,
 * so generated documents can use utility classes without boilerplate.
 */
export function withTailwind(html: string): string {
  if (/<script[^>]+tailwind/i.test(html)) return html;
  return injectHead(html, TAILWIND_TAG);
}

/**
 * Hooks page errors, unhandled rejections, and console.error, posting each to the
 * parent tagged with `nonce` so the agent's check_render tool can collect them.
 */
export function withErrorReporting(html: string, nonce: string): string {
  const script =
    `<script>(function(){` +
    `var send=function(m){try{parent.postMessage({nonce:${JSON.stringify(nonce)},error:String(m).slice(0,500)},"*")}catch(e){}};` +
    `window.addEventListener("error",function(e){send(e.message||"script error")});` +
    `window.addEventListener("unhandledrejection",function(e){send("unhandled rejection: "+((e.reason&&e.reason.message)||e.reason))});` +
    `var orig=console.error;console.error=function(){send(Array.prototype.slice.call(arguments).join(" "));orig.apply(console,arguments)};` +
    `})();</script>`;
  return injectHead(html, script);
}
