import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'
import katex from 'katex'

marked.setOptions({
  breaks: true,
  gfm: true
})

// KaTeX renderer for inline $...$ and block $$...$$
function renderKatex(text: string): string {
  // Standard LaTeX display delimiters: \[ ... \]
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_: string, formula: string) => {
    try { return `<div class="katex-block">${katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })}</div>` }
    catch { return `<pre>${formula}</pre>` }
  })
  // Block math: $$...$$
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_: string, formula: string) => {
    try { return `<div class="katex-block">${katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })}</div>` }
    catch { return `<pre>${formula}</pre>` }
  })
  // Standard LaTeX inline delimiters: \( ... \)
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_: string, formula: string) => {
    try { return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false }) }
    catch { return `\\(${formula}\\)` }
  })
  // Inline math: $...$
  text = text.replace(/\$(.*?)\$/g, (_: string, formula: string) => {
    try { return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false }) }
    catch { return `$${formula}$` }
  })
  return text
}

const renderer = new marked.Renderer()
renderer.code = ({ text, lang }): string => {
  let highlighted = ''
  try {
    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(text, { language: lang }).value
    } else {
      highlighted = hljs.highlightAuto(text).value
    }
  } catch {
    highlighted = escapeHtml(text)
  }
  return `<pre><code class="hljs language-${lang || ''}">${highlighted}</code></pre>`
}

marked.use({ renderer })

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderMarkdown(src: string): string {
  // Pre-process KaTeX before marked parses (to avoid conflict with markdown escaping)
  const processed = renderKatex(src || '')
  const raw = marked.parse(processed, { async: false }) as string
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'data-type'],
    ADD_TAGS: ['span', 'annotation'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|app):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    ALLOW_DATA_ATTR: true
  })
}
