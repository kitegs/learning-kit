// Unit tests for renderMarkdown (marked + DOMPurify + highlight.js + KaTeX).
// Run: node tests/markdown.cjs

const { JSDOM } = require('jsdom')
const createDOMPurify = require('dompurify')

// Provide a minimal DOM for DOMPurify
const dom = new JSDOM('<!DOCTYPE html>')
global.window = dom.window
global.document = dom.window.document

const { marked } = require('marked')
const hljs = require('highlight.js')
const DOMPurify = createDOMPurify(dom.window)
const katex = require('katex')

marked.setOptions({ breaks: true, gfm: true })

function renderKatex(text) {
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
    try { return '<div class="katex-block">' + katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false }) + '</div>' }
    catch { return '<pre>' + formula + '</pre>' }
  })
  text = text.replace(/\$(.*?)\$/g, (_, formula) => {
    try { return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false }) }
    catch { return '$' + formula + '$' }
  })
  return text
}

const renderer = new marked.Renderer()
renderer.code = ({ text, lang }) => {
  let highlighted = ''
  try {
    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(text, { language: lang }).value
    } else {
      highlighted = hljs.highlightAuto(text).value
    }
  } catch {
    highlighted = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  return '<pre><code class="hljs language-' + (lang || '') + '">' + highlighted + '</code></pre>'
}

marked.use({ renderer })

function renderMarkdown(src) {
  const processed = renderKatex(src || '')
  const raw = marked.parse(processed, { async: false })
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'data-type'],
    ADD_TAGS: ['span', 'annotation'],
    ALLOW_DATA_ATTR: true
  })
}

// Tests
let pass = 0, fail = 0

function t(name, fn) {
  try { fn(); pass++; console.log('  \u2713 ' + name) }
  catch (e) { fail++; console.log('  \u2717 ' + name + ': ' + e.message) }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed') }
function includes(haystack, needle) { assert(haystack.includes(needle), 'expected "' + haystack.slice(0, 120) + '" to include "' + needle + '"') }

console.log('\n=== renderMarkdown tests ===\n')

t('plain text', () => {
  const r = renderMarkdown('hello world')
  includes(r, 'hello world')
})

t('bold markdown', () => {
  const r = renderMarkdown('**bold** text')
  includes(r, '<strong>')
  includes(r, 'bold')
})

t('italic markdown', () => {
  const r = renderMarkdown('*italic*')
  includes(r, '<em>')
})

t('code block with highlight', () => {
  const r = renderMarkdown('```js\nconsole.log(1)\n```')
  includes(r, 'hljs')
})

t('empty string', () => {
  const r = renderMarkdown('')
  assert(typeof r === 'string')
  assert(r.length >= 0)
})

t('null input', () => {
  const r = renderMarkdown(null)
  assert(typeof r === 'string')
})

t('chinese text', () => {
  const r = renderMarkdown('\u6d4b\u8bd5\u4e2d\u6587')
  includes(r, '\u6d4b\u8bd5')
})

t('link', () => {
  const r = renderMarkdown('[click](https://example.com)')
  includes(r, '<a')
  includes(r, 'click')
})

t('no API key error message (regression)', () => {
  const msg = '**No API Key configured.** Open Settings and enter your API key for deepseek.'
  const r = renderMarkdown(msg)
  includes(r, 'No API Key')
  includes(r, '<strong>')
})

t('inline code', () => {
  const r = renderMarkdown('use `code` here')
  includes(r, '<code>')
})

t('katex inline math', () => {
  const r = renderMarkdown('$E=mc^2$')
  includes(r, 'katex')
})

t('mixed content', () => {
  const r = renderMarkdown('# Title\n\n**bold** and *italic* and `code`')
  includes(r, '<h1')
  includes(r, '<strong>')
  includes(r, '<em>')
  includes(r, '<code>')
})

console.log('\n' + pass + ' passed, ' + fail + ' failed\n')
process.exit(fail > 0 ? 1 : 0)
