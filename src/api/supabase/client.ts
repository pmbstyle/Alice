import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { useSettingsStore } from '../../stores/settingsStore'

function getSupabaseClient(): SupabaseClient {
  const settings = useSettingsStore().config
  if (
    (!settings.VITE_SUPABASE_URL || !settings.VITE_SUPABASE_KEY) &&
    useSettingsStore().isProduction
  ) {
    console.error('Supabase URL or Key is not configured in production.')
  }
  return createClient(settings.VITE_SUPABASE_URL, settings.VITE_SUPABASE_KEY)
}

export async function saveMemory(content: string, memoryType = 'general') {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('memories')
    .insert([{ content, memory_type: memoryType }])

  if (error) {
    console.error('Error saving memory:', error)
    return { data: null, error }
  }
  return { data, error: null }
}

export async function getRecentMemories(limit = 20, memoryType?: string) {
  const supabase = getSupabaseClient()
  console.log('Fetching recent memories...', { limit, memoryType })
  let query = supabase
    .from('memories')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (memoryType) {
    query = query.eq('memory_type', memoryType)
  }
  const { data, error } = await query
  console.log('Fetched memories:', data)

  if (error) {
    console.log('Error fetching memories:', error)
    return { data: [], error }
  }
  return { data, error: null }
}

export async function deleteMemory(id: number) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from('memories').delete().eq('id', id)

  if (error) {
    console.error('Error deleting memory:', error)
    return { data: null, error }
  }
  return data
}
