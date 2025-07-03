/**
 * Enhanced markdown parser for Alice's messages
 * Converts markdown syntax to HTML for rendering in the UI
 */
const messageMarkdown = (text: string) => {
  if (!text) return ''

  let output = text

  const markdownLinkRegex =
    /\[([^\]]+?)]\(\s*([^)\s]+?)(?:\s+["']([^"']+)["'])?\s*\)/g
  output = output.replace(markdownLinkRegex, (match, linkText, url, title) => {
    const href = url.trim()
    const titleAttribute = title ? ` title="${title.replace(/"/g, '"')}"` : ''
    const escapedLinkText = linkText.replace(/</g, '<').replace(/>/g, '>')
    return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttribute}>${escapedLinkText}</a>`
  })

  const potentialUrlRegex =
    /((?:https?:\/\/)?(?:[\w-]+\.)+[\w-]+(?:[\/\?#][^\s<>()"]*)?)/gi

  let lastIndex = 0
  let processedOutput = ''
  let match

  const existingLinksRanges: { start: number; end: number }[] = []
  output.replace(
    /<a\s[^>]*href="[^"]*"[^>]*>.*?<\/a>/g,
    (linkMatch, offset) => {
      existingLinksRanges.push({
        start: offset,
        end: offset + linkMatch.length,
      })
      return linkMatch
    }
  )

  while ((match = potentialUrlRegex.exec(output)) !== null) {
    const matchStartIndex = match.index
    const matchEndIndex = matchStartIndex + match[0].length
    const urlCandidate = match[0]

    let isInsideExistingLink = false
    for (const range of existingLinksRanges) {
      if (matchStartIndex >= range.start && matchStartIndex < range.end) {
        isInsideExistingLink = true
        break
      }
    }

    const textBefore = output.substring(
      Math.max(0, matchStartIndex - 7),
      matchStartIndex
    )
    if (textBefore.match(/href\s*=\s*["']$/i)) {
      isInsideExistingLink = true
    }

    processedOutput += output.substring(lastIndex, matchStartIndex)

    if (isInsideExistingLink) {
      processedOutput += urlCandidate
    } else {
      let urlToLink = urlCandidate
      if (
        !urlToLink.startsWith('http://') &&
        !urlToLink.startsWith('https://')
      ) {
        if (/^([\w-]+\.)+[\w-]+/.test(urlToLink)) {
          urlToLink = `https://${urlToLink}`
        } else {
          processedOutput += urlCandidate
          lastIndex = matchEndIndex
          continue
        }
      }
      processedOutput += `<a href="${urlToLink}" target="_blank" rel="noopener noreferrer">${urlCandidate}</a>`
    }
    lastIndex = matchEndIndex
  }
  processedOutput += output.substring(lastIndex)
  output = processedOutput

  output = output.replace(/(\r\n|\n|\r)/gm, '<br>')
  output = output.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')
  output = output.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>')
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>')
  output = output.replace(/~~(.*?)~~/g, '<del>$1</del>')

  output = output.replace(
    /(^|\s)#([^\s<]+)/gm,
    '$1<span class="hashtag">#$2</span>'
  )
  output = output.replace(
    /(^|\s)@([^\s<]+)/gm,
    '$1<span class="mention">@$2</span>'
  )

  return output
}

export { messageMarkdown }
