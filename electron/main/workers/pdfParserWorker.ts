import { parentPort } from 'node:worker_threads'
import fs from 'node:fs/promises'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

if (!parentPort) {
  throw new Error('[RAG] PDF worker started without a parent port.')
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
      const text = content.items.map((item: any) => item.str).join(' ')
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
