/**
 * Enhanced markdown parser for Alice's messages
 * Converts markdown syntax to HTML for rendering in the UI
 */
const messageMarkdown = (text: string) => {
  if (!text) return ''

  let output = text

  // Process markdown links [text](url) first, before any HTML escaping
  const markdownLinkRegex = /\[([^\]]+)]\(([^)]+)\)/g
  output = output.replace(markdownLinkRegex, (match, linkText, url) => {
    const cleanUrl = url.trim()
    // Escape the link text to prevent HTML injection
    const escapedLinkText = linkText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return `<a href="${cleanUrl}" style="text-decoration:underline;" target="_blank" rel="noopener noreferrer">${escapedLinkText}</a>`
  })

  // Find existing links to avoid double-processing
  const existingLinksRanges: { start: number; end: number }[] = []
  output.replace(/<a\s[^>]*href="[^"]*"[^>]*>.*?<\/a>/gi, (linkMatch, offset) => {
    existingLinksRanges.push({
      start: offset,
      end: offset + linkMatch.length,
    })
    return linkMatch
  })

  // Now escape HTML characters in text that is not part of links
  const segments: string[] = []
  let lastIndex = 0

  // Find all links
  output.replace(/<a\s[^>]*href="[^"]*"[^>]*>.*?<\/a>/gi, (linkMatch, offset) => {
    // Add escaped text before this link
    const textBefore = output.substring(lastIndex, offset)
    segments.push(
      textBefore
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    )
    
    // Add the link as-is (already processed)
    segments.push(linkMatch)
    
    lastIndex = offset + linkMatch.length
    return linkMatch
  })
  
  // Add remaining text (escaped)
  const remainingText = output.substring(lastIndex)
  segments.push(
    remainingText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  )
  
  output = segments.join('')

  // Process line breaks
  output = output.replace(/(\r\n|\n|\r)/gm, '<br>')

  // Process bold (**text** or __text__)
  output = output.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')

  // Process italics (*text* or _text_)
  output = output.replace(/(\*)(.*?)\1/g, '<em>$2</em>')

  // Process inline code (`code`)
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Process strikethrough (~~text~~)
  output = output.replace(/~~(.*?)~~/g, '<del>$1</del>')

  // Process hashtags (#tag)
  output = output.replace(
    /(^|\s)#([^\s<]+)/gm,
    '$1<span class="hashtag">#$2</span>'
  )

  // Process mentions (@user) - avoid email addresses
  output = output.replace(
    /(^|\s)@([^\s<@]+)/gm,
    '$1<span class="mention">@$2</span>'
  )

  // Process plain URLs, but avoid email addresses and existing links
  // Find existing links again after all processing
  const finalExistingLinksRanges: { start: number; end: number }[] = []
  output.replace(/<a\s[^>]*href="[^"]*"[^>]*>.*?<\/a>/gi, (linkMatch, offset) => {
    finalExistingLinksRanges.push({
      start: offset,
      end: offset + linkMatch.length,
    })
    return linkMatch
  })

  const potentialUrlRegex = /\b(?:https?:\/\/|www\.)[\w-]+(?:\.[\w-]+)+(?:[^\s<>()'"]*[^.\s<>()'"])?/gi

  lastIndex = 0
  let processedOutput = ''
  let match

  while ((match = potentialUrlRegex.exec(output)) !== null) {
    const matchStartIndex = match.index
    const matchEndIndex = matchStartIndex + match[0].length
    const urlCandidate = match[0]

    // Check if this URL is inside an existing link
    let isInsideExistingLink = false
    for (const range of finalExistingLinksRanges) {
      if (matchStartIndex >= range.start && matchStartIndex < range.end) {
        isInsideExistingLink = true
        break
      }
    }

    // Additional check to avoid email addresses
    if (urlCandidate.includes('@') && !urlCandidate.startsWith('http') && !urlCandidate.startsWith('www')) {
      isInsideExistingLink = true
    }

    processedOutput += output.substring(lastIndex, matchStartIndex)

    if (isInsideExistingLink) {
      processedOutput += urlCandidate
    } else {
      let urlToLink = urlCandidate
      if (!urlToLink.startsWith('http://') && !urlToLink.startsWith('https://')) {
        urlToLink = `https://${urlToLink}`
      }
      processedOutput += `<a href="${urlToLink}" style="text-decoration:underline;" target="_blank" rel="noopener noreferrer">${urlCandidate}</a>`
    }
    lastIndex = matchEndIndex
  }
  processedOutput += output.substring(lastIndex)
  output = processedOutput

  const linkSegments: string[] = []
  lastIndex = 0

  output.replace(/<a\s[^>]*href="[^"]*"[^>]*>.*?<\/a>/gi, (linkMatch, offset) => {
    const textBefore = output.substring(lastIndex, offset)
    const processedTextBefore = textBefore.replace(/(_)_(.*?)_\1/g, '<em>$2</em>')
    linkSegments.push(processedTextBefore)
    linkSegments.push(linkMatch)
    
    lastIndex = offset + linkMatch.length
    return linkMatch
  })
  
  const remainingText2 = output.substring(lastIndex)

  const processedRemainingText = remainingText2.replace(/(_)_(.*?)_\1/g, '<em>$2</em>')
  linkSegments.push(processedRemainingText)
  
  output = linkSegments.join('')

  return output
}

export { messageMarkdown }