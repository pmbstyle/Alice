export interface RagSearchResult {
  id: string
  text: string
  path: string
  title: string
  page?: number | null
  section?: string | null
  score: number
}
