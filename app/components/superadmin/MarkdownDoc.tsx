'use client'

import type { CSSProperties, ReactNode } from 'react'
import { theme } from '../ui'

/** Lightweight markdown for internal docs (headings, lists, code, tables). */
export function MarkdownDoc({ source }: { source: string }) {
  const blocks = parseMarkdownBlocks(source)
  return <div style={styles.root}>{blocks.map((block, i) => renderBlock(block, i))}</div>
}

type Block =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'code'; text: string }
  | { type: 'table'; rows: string[][] }

function parseMarkdownBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      blocks.push({ type: 'code', text: codeLines.join('\n') })
      i++
      continue
    }

    if (line.startsWith('|') && line.includes('|')) {
      const tableRows: string[][] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[\s\-:|]+\|$/.test(lines[i].trim())) {
          tableRows.push(
            lines[i]
              .split('|')
              .slice(1, -1)
              .map((c) => c.trim())
          )
        }
        i++
      }
      if (tableRows.length) blocks.push({ type: 'table', rows: tableRows })
      continue
    }

    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4) })
      i++
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3) })
      i++
      continue
    }
    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2) })
      i++
      continue
    }

    if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    if (line.trim() === '') {
      i++
      continue
    }

    const paraLines: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('- ') && !lines[i].startsWith('|') && !lines[i].startsWith('```')) {
      paraLines.push(lines[i])
      i++
    }
    blocks.push({ type: 'p', text: paraLines.join(' ') })
  }

  return blocks
}

function inlineFormat(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} style={styles.inlineCode}>
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function renderBlock(block: Block, key: number) {
  switch (block.type) {
    case 'h1':
      return (
        <h1 key={key} style={styles.h1}>
          {inlineFormat(block.text)}
        </h1>
      )
    case 'h2':
      return (
        <h2 key={key} style={styles.h2}>
          {inlineFormat(block.text)}
        </h2>
      )
    case 'h3':
      return (
        <h3 key={key} style={styles.h3}>
          {inlineFormat(block.text)}
        </h3>
      )
    case 'p':
      return (
        <p key={key} style={styles.p}>
          {inlineFormat(block.text)}
        </p>
      )
    case 'ul':
      return (
        <ul key={key} style={styles.ul}>
          {block.items.map((item, j) => (
            <li key={j} style={styles.li}>
              {inlineFormat(item)}
            </li>
          ))}
        </ul>
      )
    case 'code':
      return (
        <pre key={key} style={styles.pre}>
          <code>{block.text}</code>
        </pre>
      )
    case 'table':
      return (
        <div key={key} style={styles.tableWrap}>
          <table style={styles.table}>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={ri === 0 ? styles.th : styles.td}>
                      {inlineFormat(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    default:
      return null
  }
}

const styles: Record<string, CSSProperties> = {
  root: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    lineHeight: 1.65,
  },
  h1: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: 700,
    margin: '0 0 16px',
    color: theme.colors.textPrimary,
  },
  h2: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: 700,
    margin: '28px 0 10px',
    color: theme.colors.textPrimary,
    borderBottom: `1px solid ${theme.colors.border}`,
    paddingBottom: 6,
  },
  h3: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: 600,
    margin: '20px 0 8px',
    color: theme.colors.textPrimary,
  },
  p: { margin: '0 0 12px', color: theme.colors.textSecondary },
  ul: { margin: '0 0 16px', paddingInlineStart: 22 },
  li: { marginBottom: 6, color: theme.colors.textSecondary },
  pre: {
    margin: '0 0 16px',
    padding: 14,
    borderRadius: theme.radius.md,
    background: theme.colors.muted,
    overflow: 'auto',
    fontSize: 12,
    direction: 'ltr',
    textAlign: 'left',
  },
  inlineCode: {
    fontFamily: 'monospace',
    fontSize: '0.9em',
    background: theme.colors.muted,
    padding: '1px 5px',
    borderRadius: 4,
  },
  tableWrap: { overflowX: 'auto', marginBottom: 16 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    padding: '8px 10px',
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.muted,
    fontWeight: 600,
    textAlign: 'right',
  },
  td: {
    padding: '8px 10px',
    border: `1px solid ${theme.colors.border}`,
    verticalAlign: 'top',
  },
}
