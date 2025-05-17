import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const MEMORIES_FILE_NAME = 'alice-memories.json'
const memoriesFilePath = path.join(app.getPath('userData'), MEMORIES_FILE_NAME)

export interface Memory {
  id: string
  content: string
  memoryType: string
  createdAt: string
}

async function readMemoriesFromFile(): Promise<Memory[]> {
  try {
    await fs.access(memoriesFilePath)
    const jsonData = await fs.readFile(memoriesFilePath, 'utf-8')
    return JSON.parse(jsonData) as Memory[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    console.warn(
      'Failed to read memories file or file is corrupted:',
      (error as Error).message
    )
    e
    return []
  }
}

async function writeMemoriesToFile(memories: Memory[]): Promise<void> {
  try {
    const jsonData = JSON.stringify(memories, null, 2)
    await fs.writeFile(memoriesFilePath, jsonData, 'utf-8')
  } catch (error) {
    console.error('Failed to write memories file:', error)
    throw error
  }
}

export async function saveMemoryLocal(
  content: string,
  memoryType: string = 'general'
): Promise<Memory> {
  const memories = await readMemoriesFromFile()
  const newMemory: Memory = {
    id: randomUUID(),
    content,
    memoryType,
    createdAt: new Date().toISOString(),
  }
  memories.push(newMemory)
  await writeMemoriesToFile(memories)
  console.log('Memory saved locally:', newMemory.id)
  return newMemory
}

export async function getRecentMemoriesLocal(
  limit: number = 20,
  memoryType?: string
): Promise<Memory[]> {
  let memories = await readMemoriesFromFile()

  if (memoryType) {
    memories = memories.filter(mem => mem.memoryType === memoryType)
  }

  memories.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return memories.slice(0, limit)
}

export async function updateMemoryLocal(
  id: string,
  updatedContent: string,
  updatedMemoryType: string
): Promise<Memory | null> {
  let memories = await readMemoriesFromFile()
  const memoryIndex = memories.findIndex(mem => mem.id === id)

  if (memoryIndex === -1) {
    console.log('Memory not found for update:', id)
    return null
  }

  memories[memoryIndex].content = updatedContent
  memories[memoryIndex].memoryType = updatedMemoryType

  await writeMemoriesToFile(memories)
  console.log('Memory updated locally:', id)
  return memories[memoryIndex]
}

export async function deleteMemoryLocal(id: string): Promise<boolean> {
  let memories = await readMemoriesFromFile()
  const initialLength = memories.length
  memories = memories.filter(mem => mem.id !== id)

  if (memories.length < initialLength) {
    await writeMemoriesToFile(memories)
    console.log('Memory deleted locally:', id)
    return true
  }
  console.log('Memory not found for deletion:', id)
  return false
}

export async function deleteAllMemoriesLocal(): Promise<void> {
  await writeMemoriesToFile([])
  console.log('All local memories deleted.')
}
