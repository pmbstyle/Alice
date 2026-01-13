/**
 * String Similarity Utilities for Fuzzy Wake Word Matching
 * Uses Levenshtein distance algorithm to calculate similarity between strings
 */

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of single-character edits required
 * to change one word into the other
 *
 * @param str1 First string to compare
 * @param str2 Second string to compare
 * @returns Number of edits needed (0 = identical)
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length

  // Create a 2D array for dynamic programming
  const matrix: number[][] = []

  // Initialize first column and row
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return matrix[len1][len2]
}

/**
 * Calculate similarity ratio between two strings (0-1 scale)
 * 1.0 = identical, 0.0 = completely different
 *
 * @param str1 First string to compare
 * @param str2 Second string to compare
 * @returns Similarity score between 0.0 and 1.0
 *
 * @example
 * similarityRatio("alice", "alice")   // 1.00 (perfect match)
 * similarityRatio("alice", "aliss")   // 0.83 (very similar)
 * similarityRatio("alice", "eloise")  // 0.50 (somewhat similar)
 * similarityRatio("alice", "bob")     // 0.20 (very different)
 */
export function similarityRatio(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase())
  const maxLength = Math.max(str1.length, str2.length)

  if (maxLength === 0) return 1.0

  return 1 - distance / maxLength
}

/**
 * Check if two strings are similar based on a threshold
 *
 * @param str1 First string
 * @param str2 Second string
 * @param threshold Similarity threshold (0-1, default 0.75)
 * @returns true if similarity >= threshold
 */
export function isSimilar(
  str1: string,
  str2: string,
  threshold: number = 0.75
): boolean {
  return similarityRatio(str1, str2) >= threshold
}

/**
 * Custom phonetic mappings for wake words
 * Add variations that sound similar but transcribe differently
 *
 * Structure: { wakeword: [variation1, variation2, ...] }
 */
export const PHONETIC_MAPPINGS: Record<string, string[]> = {
  alice: [
    'eyalis',     // "Hey Alice" often transcribed as "eyalis"
    'ialis',      // Sometimes the 'a' is dropped
    'eyalice',    // Another common variation
    'a lice',     // Space inserted
    'elise',      // Phonetically similar
    'ellis',      // Phonetically similar
    'aliss',      // Common typo/mishearing
    'alise',      // Common typo/mishearing
    'alis',       // Shortened
    'alicia',     // Common name confusion
    'alyssa',     // Common name confusion
    'alexa',      // Common smart assistant confusion
    'eloise',     // Phonetically similar
  ],
  // Add more wake words here if you have custom ones
  // 'jarvis': ['jervis', 'jarvas', 'jarviss'],
  // 'friday': ['fryday', 'fridey', 'frida'],
}

/**
 * Check if a word matches a wake word phonetically
 * Uses custom phonetic mappings in addition to similarity ratio
 *
 * @param word The word to check (from transcription)
 * @param wakeWord The target wake word
 * @param threshold Similarity threshold for fuzzy matching (0-1, default 0.75)
 * @returns true if word matches wake word phonetically or via similarity
 */
export function matchesPhonetically(
  word: string,
  wakeWord: string,
  threshold: number = 0.75
): boolean {
  const normalizedWord = word.toLowerCase().trim()
  const normalizedWakeWord = wakeWord.toLowerCase().trim()

  // 1. Exact match
  if (normalizedWord === normalizedWakeWord) {
    return true
  }

  // 2. Check custom phonetic mappings
  const mappings = PHONETIC_MAPPINGS[normalizedWakeWord] || []
  if (mappings.some(variant => normalizedWord === variant)) {
    console.log(`[Phonetic Match] "${word}" matched via custom mapping to "${wakeWord}"`)
    return true
  }

  // 3. Fallback to fuzzy similarity
  const similarity = similarityRatio(normalizedWord, normalizedWakeWord)
  if (similarity >= threshold) {
    console.log(`[Fuzzy Match] "${word}" matched to "${wakeWord}" (${(similarity * 100).toFixed(1)}% similar)`)
    return true
  }

  return false
}

/**
 * Enhanced similarity ratio that checks phonetic mappings first
 * Returns 1.0 if there's a phonetic match, otherwise returns regular similarity
 *
 * @param str1 First string to compare
 * @param str2 Second string to compare
 * @param usePhoneticMappings Whether to check phonetic mappings (default: true)
 * @returns Similarity score between 0.0 and 1.0
 */
export function similarityRatioEnhanced(
  str1: string,
  str2: string,
  usePhoneticMappings: boolean = true
): number {
  const normalized1 = str1.toLowerCase().trim()
  const normalized2 = str2.toLowerCase().trim()

  // Check phonetic mappings first
  if (usePhoneticMappings) {
    const mappings = PHONETIC_MAPPINGS[normalized2] || []
    if (mappings.includes(normalized1)) {
      return 1.0 // Perfect match via phonetic mapping
    }

    // Also check reverse (in case str1 is the wake word)
    const mappingsReverse = PHONETIC_MAPPINGS[normalized1] || []
    if (mappingsReverse.includes(normalized2)) {
      return 1.0
    }
  }

  // Fallback to regular similarity calculation
  return similarityRatio(str1, str2)
}
