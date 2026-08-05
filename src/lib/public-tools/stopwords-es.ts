/** Central Spanish stopword list, shared by the word counter and the title/keyword analyzers so the exclusion list is never duplicated per tool. */
export const SPANISH_STOPWORDS: ReadonlySet<string> = new Set([
  "a", "al", "algo", "algunas", "algunos", "ante", "antes", "como", "con", "contra", "cual", "cuando",
  "de", "del", "desde", "donde", "durante", "e", "el", "ella", "ellas", "ellos", "en", "entre", "era",
  "erais", "eran", "eras", "eres", "es", "esa", "esas", "ese", "eso", "esos", "esta", "estas", "este",
  "esto", "estos", "fue", "fueron", "ha", "había", "han", "hasta", "la", "las", "le", "les", "lo",
  "los", "más", "me", "mi", "mis", "mucho", "muy", "nada", "ni", "no", "nos", "nosotros", "o",
  "os", "otra", "otras", "otro", "otros", "para", "pero", "poco", "por", "porque", "que", "qué",
  "se", "sí", "sin", "sobre", "su", "sus", "también", "tanto", "te", "tener", "ti", "todo",
  "todos", "tu", "tus", "un", "una", "uno", "unos", "y", "ya", "yo",
]);

export function isSpanishStopword(word: string): boolean {
  return SPANISH_STOPWORDS.has(word.toLowerCase());
}
