const messageMarkdown = (text: string) => {
    let output = text.replace(/(\r\n|\n|\r)/gm, '<br>')
    output = output.replace(/(https?:\/\/[^\s]+)/gm, '<a href="$1" target="_blank">$1</a>')
    output = output.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')
    output = output.replace(/(^|\s)#([^\s]+)/gm, '$1<span class="hashtag">#$2</span>')
    output = output.replace(/(^|\s)@([^\s]+)/gm, '$1<span class="mention">@$2</span>')
    return output
}

export {
    messageMarkdown
}