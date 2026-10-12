/** Decode file bytes as text, handling UTF-8 and UTF-16 byte order marks. */
export function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let encoding = 'utf-8'
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le'
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be'
  let text = new TextDecoder(encoding).decode(bytes)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text
}

/** Plain-language reason a text file cannot be read, or null if it looks usable. */
export function rejectReason(text: string): string | null {
  const head = text.slice(0, 200).trimStart().toLowerCase()
  if (head.startsWith('<')) return 'This file looks like HTML or XML. Export as delimited text instead.'
  if (text.includes('\u0000')) return 'This file does not look like text.'
  if (!text.trim()) return 'This file is empty.'
  return null
}
