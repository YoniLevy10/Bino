import type { ReactNode } from 'react'

type Block =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }

/** Minimal inline markdown: **bold** and [label](url) only. */
function formatInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index))
    }
    const token = match[0]
    if (token.startsWith('**')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    } else {
      const m = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (m) {
        const href = m[2]
        const safeHref =
          href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/')
            ? href
            : '#'
        nodes.push(
          <a key={key++} href={safeHref} style={{ color: '#1e40af', fontWeight: 600 }}>
            {m[1]}
          </a>
        )
      }
    }
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function parseMarkdownBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()

    if (!trimmed) {
      i += 1
      continue
    }

    if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.slice(4).trim() })
      i += 1
      continue
    }
    if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.slice(3).trim() })
      i += 1
      continue
    }
    if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.slice(2).trim() })
      i += 1
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''))
        i += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    const para: string[] = [trimmed]
    i += 1
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,3}\s/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim())
      i += 1
    }
    blocks.push({ type: 'p', text: para.join(' ') })
  }

  return blocks
}

/** Renders a subset of markdown as real heading/paragraph HTML for SEO. */
export function MarkdownProse({ source }: { source: string }) {
  const blocks = parseMarkdownBlocks(source)

  return (
    <article style={{ fontSize: 15, lineHeight: 1.7, color: '#0f172a' }}>
      {blocks.map((block, idx) => {
        if (block.type === 'h1') {
          return (
            <h1 key={idx} style={{ margin: '0 0 16px', fontSize: 28, fontWeight: 800, lineHeight: 1.25 }}>
              {formatInline(block.text)}
            </h1>
          )
        }
        if (block.type === 'h2') {
          return (
            <h2 key={idx} style={{ margin: '28px 0 10px', fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>
              {formatInline(block.text)}
            </h2>
          )
        }
        if (block.type === 'h3') {
          return (
            <h3 key={idx} style={{ margin: '20px 0 8px', fontSize: 17, fontWeight: 700, lineHeight: 1.35 }}>
              {formatInline(block.text)}
            </h3>
          )
        }
        if (block.type === 'ul') {
          return (
            <ul key={idx} style={{ margin: '0 0 16px', paddingInlineStart: 22 }}>
              {block.items.map((item, j) => (
                <li key={j} style={{ marginBottom: 6 }}>
                  {formatInline(item)}
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={idx} style={{ margin: '0 0 14px', color: '#1e293b' }}>
            {formatInline(block.text)}
          </p>
        )
      })}
    </article>
  )
}
