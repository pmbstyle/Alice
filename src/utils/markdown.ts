import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.use({
  renderer: {
    link({ href, title, text }) {
      let safeHref = href || ''

      try {
        if (
          safeHref.startsWith('http://') ||
          safeHref.startsWith('https://') ||
          safeHref.startsWith('mailto:')
        ) {
          const url = new URL(safeHref)
          // Remove tracking parameters
          url.searchParams.forEach((value, key) => {
            if (key.startsWith('utm_')) {
              url.searchParams.delete(key)
            }
          })
          safeHref = url.toString()
        }
      } catch (e) {
        console.warn('Invalid URL in markdown link:', safeHref)
      }

      const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''
      const hrefAttr = safeHref
        ? ` href="${safeHref.replace(/"/g, '&quot;')}"`
        : ''

      const securityAttrs =
        safeHref.startsWith('http://') || safeHref.startsWith('https://')
          ? ' rel="noopener noreferrer"'
          : ''

      return `<a${hrefAttr}${titleAttr}${securityAttrs} style="text-decoration:underline;">${text}</a>`
    },

    code({ text, lang }) {
      const language = lang ? lang.toLowerCase() : ''
      const languageClass = language ? ` class="language-${language}"` : ''
      const languageLabel = language
        ? `<div class="code-language">${language}</div>`
        : ''

      return `<div class="code-block-wrapper">
        ${languageLabel}
        <pre style="background-color: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 0.875rem; line-height: 1.4; margin: 0.5rem 0;"><code${languageClass}>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
      </div>`
    },

    codespan({ text }) {
      return `<code style="background-color: #374151; color: #f3f4f6; padding: 0.125rem 0.25rem; border-radius: 0.25rem; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 0.875rem;">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`
    },

    blockquote({ text }) {
      return `<blockquote style="border-left: 4px solid #6366f1; padding-left: 1rem; margin: 1rem 0; color: #9ca3af; font-style: italic; background-color: rgba(99, 102, 241, 0.05); padding: 0.75rem 1rem; border-radius: 0.25rem;">${text}</blockquote>`
    },
  },
  gfm: true,
  breaks: true,
  headerIds: false,
})

const messageMarkdown = (text: string): string => {
  if (!text) return ''

  try {
    const withCitations = text.replace(
      /\[([^\]]+#p\d+)\]/gi,
      '<span class="rag-citation">[$1]</span>'
    )
    const rawHtml = marked.parse(withCitations) as string
    const cleanHtml = DOMPurify.sanitize(rawHtml, {
      USE_PROFILES: { html: true },
      ALLOWED_ATTR: ['href', 'title', 'rel', 'style', 'class', 'id', 'data-*'],
      ALLOWED_TAGS: [
        'a',
        'abbr',
        'b',
        'blockquote',
        'br',
        'cite',
        'code',
        'dd',
        'dl',
        'dt',
        'em',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'hr',
        'i',
        'li',
        'ol',
        'p',
        'pre',
        'q',
        's',
        'small',
        'span',
        'strong',
        'sub',
        'sup',
        'table',
        'tbody',
        'td',
        'tfoot',
        'th',
        'thead',
        'tr',
        'u',
        'ul',
      ],
      KEEP_CONTENT: true,
    })
    return cleanHtml
  } catch (error) {
    console.error('Error parsing markdown:', error)
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
}

export { messageMarkdown }
