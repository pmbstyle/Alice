import { CORE_SYSTEM_PROMPT } from './coreSystemPrompt'

export function buildAssistantSystemPrompt(personaPrompt?: string): string {
  const core = CORE_SYSTEM_PROMPT.trim()
  const persona = (personaPrompt || '').trim()
  if (!persona) return core
  return `${core}\n\n${persona}`
}
