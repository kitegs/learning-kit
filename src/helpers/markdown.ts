import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

marked.setOptions({
  breaks: true,
  gfm: true
})

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
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function renderMarkdown(src: string): string {
  const raw = marked.parse(src || '', { async: false }) as string
  return DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] })
}