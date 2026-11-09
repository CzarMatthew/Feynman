/** Count words the way a teacher would: runs of letters/digits, with
 * apostrophes and hyphens kept inside a word. */
export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}
