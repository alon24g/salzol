// Hebrew-aware text normalization shared by search indexing and querying.

const NIQQUD = /[֑-ׇ]/g // cantillation + vowel points
const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }
const FINAL_RE = /[ךםןףץ]/g
// Quotes, geresh/gershayim, maqaf, hyphens and other punctuation become spaces.
const PUNCT = /["'`״׳־\-–—,:;!?()[\]{}/\\*+_|]/g
const NON_DECIMAL_DOT = /(?<!\d)\.|\.(?!\d)/g // keep "1.5", drop sentence/abbreviation dots

export function normalizeHebrew(text: string): string {
  return text
    .normalize('NFC')
    .replace(NIQQUD, '')
    .replace(FINAL_RE, (c) => FINALS[c])
    .replace(PUNCT, ' ')
    .replace(NON_DECIMAL_DOT, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Split into searchable terms; also separates numbers glued to words ("60ג" → "60 ג"). */
export function tokenize(text: string): string[] {
  return normalizeHebrew(text)
    .replace(/(\d)([^\d\s.])/g, '$1 $2')
    .replace(/([^\d\s.])(\d)/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
}
