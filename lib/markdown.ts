import { Marked } from "marked";

// `breaks` keeps single newlines as <br>, so prose reads the way it was typed.
// Raw HTML passes through untouched, which is the point: markdown-flavoured html essays.
const marked = new Marked({ gfm: true, breaks: true });

const TAILWIND_TYPOGRAPHY_CDN = "https://cdn.tailwindcss.com?plugins=typography";

export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown, { async: false });
}

/** Wraps rendered markdown in a standalone document, styled as prose. */
export function markdownDocument(markdown: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="${TAILWIND_TYPOGRAPHY_CDN}"></script>
</head>
<body class="bg-white">
<article class="prose prose-neutral mx-auto max-w-2xl px-6 py-10">
${renderMarkdown(markdown)}
</article>
</body>
</html>`;
}
