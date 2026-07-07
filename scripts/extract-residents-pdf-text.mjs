#!/usr/bin/env node
/**
 * Extract tab-oriented text from residents directory PDF (for import script).
 * Usage: node scripts/extract-residents-pdf-text.mjs [input.pdf] [output.txt]
 */
import fs from 'node:fs'
import path from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const input = path.resolve(process.argv[2] || 'data/residents-directory.pdf')
const output = path.resolve(process.argv[3] || 'data/residents-directory.txt')

const data = new Uint8Array(fs.readFileSync(input))
const doc = await getDocument({ data }).promise
let text = ''

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  const content = await page.getTextContent()
  let lastY = null
  let line = ''

  for (const item of content.items) {
    const y = item.transform[5]
    if (lastY !== null && Math.abs(y - lastY) > 2) {
      text += `${line.trimEnd()}\n`
      line = ''
    }
    line += (line && !line.endsWith('\t') ? '\t' : '') + item.str
    if (item.hasEOL) {
      text += `${line}\n`
      line = ''
    }
    lastY = y
  }
  if (line) text += `${line}\n`
  text += '\n'
}

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, text)
console.log(`Wrote ${output} (${doc.numPages} pages, ${text.split('\n').length} lines)`)
