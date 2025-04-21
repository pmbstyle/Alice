/**
 * Enhanced markdown parser for Alice's messages
 * Converts markdown syntax to HTML for rendering in the UI
 */
const messageMarkdown = (text: string) => {
  if (!text) return ''

  let output = text

  output = output.replace(/(\r\n|\n|\r)/gm, '<br>')

  const urlRegex =
    /(?:https?:\/\/[^\s,.!?]+[^\s,.!?"')}])|(?:\b(?:(?:[\w-]+\.)+(?:com|org|net|edu|gov|mil|io|co|gl|ai|app|dev|xyz|me|info|biz|ca|uk|au|de|jp|fr|tv|site|online)(?:\/[^\s,.!?;:(){}\[\]"']*[^\s,.!?;:(){}\[\]"'])?))/gi

  output = output.replace(urlRegex, match => {
    if (match.startsWith('http://') || match.startsWith('https://')) {
      return `<a href="${match}" target="_blank" rel="noopener noreferrer">${match}</a>`
    }
    return `<a href="https://${match}" target="_blank" rel="noopener noreferrer">${match}</a>`
  })

  output = output.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')

  output = output.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>')

  output = output.replace(/`([^`]+)`/g, '<code>$1</code>')

  output = output.replace(/~~(.*?)~~/g, '<del>$1</del>')

  output = output.replace(/^>\s*(.*?)$/gm, '<blockquote>$1</blockquote>')

  output = output.replace(
    /(^|\s)#([^\s]+)/gm,
    '$1<span class="hashtag">#$2</span>'
  )

  output = output.replace(
    /(^|\s)@([^\s]+)/gm,
    '$1<span class="mention">@$2</span>'
  )

  output = output.replace(
    /!\[(.*?)\]\((.*?)\)/g,
    '<img src="$2" alt="$1" class="inline-image">'
  )

  return output
}

export { messageMarkdown }
