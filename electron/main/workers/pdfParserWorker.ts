import { parentPort, workerData } from 'node:worker_threads'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'

if (!parentPort) {
  throw new Error('[RAG] PDF worker started without a parent port.')
}

const resolveWorkerSrc = (): string => {
  const appPath = workerData?.appPath || process.cwd()
  const candidates = [
    path.join(appPath, 'dist-electron', 'main', 'workers', 'pdf.worker.mjs'),
    path.join(
      appPath,
      'node_modules',
      'pdfjs-dist',
      'legacy',
      'build',
      'pdf.worker.mjs'
    ),
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'pdf.worker.mjs'
    ),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return pathToFileURL(candidate).toString()
    }
  }

  return pathToFileURL(
    path.join(
      appPath,
      'node_modules',
      'pdfjs-dist',
      'legacy',
      'build',
      'pdf.worker.mjs'
    )
  ).toString()
}

GlobalWorkerOptions.workerSrc = resolveWorkerSrc()

type PdfTextItem = {
  str?: string
  transform?: number[]
  width?: number
}

const buildTextFromItems = (items: PdfTextItem[]): string => {
  const lineBuckets = new Map<number, PdfTextItem[]>()
  const lineThreshold = 2

  items.forEach(item => {
    const transform = item.transform
    if (
      !transform ||
      typeof transform[4] !== 'number' ||
      typeof transform[5] !== 'number'
    ) {
      return
    }
    const yKey = Math.round(transform[5] / lineThreshold) * lineThreshold
    const bucket = lineBuckets.get(yKey) || []
    bucket.push(item)
    lineBuckets.set(yKey, bucket)
  })

  const sortedLines = Array.from(lineBuckets.entries()).sort((a, b) => b[0] - a[0])

  const lines: string[] = []
  sortedLines.forEach(([, lineItems]) => {
    lineItems.sort((a, b) => {
      const ax = a.transform?.[4] ?? 0
      const bx = b.transform?.[4] ?? 0
      return ax - bx
    })
    let line = ''
    let lastEnd = -Infinity
    lineItems.forEach(item => {
      const text = String(item.str || '')
      if (!text) return
      const x = item.transform?.[4] ?? 0
      const width = item.width ?? 0
      const gap = x - lastEnd
      if (line && gap > 2) {
        line += ' '
      }
      line += text
      lastEnd = x + width
    })
    if (line.trim()) {
      lines.push(line)
    }
  })

  return lines.join('\n')
}

parentPort.on('message', async message => {
  const filePath = message?.filePath
  if (!filePath || typeof filePath !== 'string') {
    parentPort?.postMessage({
      success: false,
      error: '[RAG] PDF worker missing file path.',
    })
    return
  }

  try {
    const buffer = await fs.readFile(filePath)
    const data = new Uint8Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    )
    const pdf = await getDocument({ data, disableWorker: true }).promise
    const sections: Array<{ text: string; page: number }> = []

    for (let page = 1; page <= pdf.numPages; page += 1) {
      const pageData = await pdf.getPage(page)
      const content = await pageData.getTextContent()
      const text = buildTextFromItems(content.items as PdfTextItem[])
      sections.push({ text, page })
    }

    parentPort?.postMessage({ success: true, sections })
  } catch (error) {
    parentPort?.postMessage({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})
