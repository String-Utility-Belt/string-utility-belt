/**
 * Checks that no text file the site serves holds a raw control character (C0 other than tab,
 * LF and CR, plus DEL). HTML parsers turn NUL into U+FFFD and treat the rest as parse errors,
 * crawlers and tools may take the file as binary, and a reader sees nothing where the character
 * is. Pages show them as Control Pictures (`showControlChars`), guides write them that way
 * (`src/app/pages/guide.ts`) and JS chunks escape them (`scripts/vite-plugin-escape-controls.ts`);
 * `scripts/build-seo.ts` runs this over the whole output in every build, so a new path that
 * writes one fails the build instead of shipping.
 */
import fs from 'node:fs'
import path from 'node:path'
import { HIDDEN_CONTROL_CHAR, showControlChars } from '../src/core/coerce'

/** Extensions of the text files a build writes; images, fonts and wasm are binary by design. */
export const TEXT_EXTENSIONS = new Set(['.html', '.xml', '.md', '.txt', '.json', '.webmanifest', '.js', '.mjs', '.css', '.svg', '.map'])

/** One problem per line of `text` holding a hidden control character, with its line and what is around it. */
export function controlCharProblems(text: string): string[] {
  if (!HIDDEN_CONTROL_CHAR.test(text)) return []
  const problems: string[] = []
  for (const [i, line] of text.split('\n').entries()) {
    const at = line.search(HIDDEN_CONTROL_CHAR)
    if (at === -1) continue
    const code = line.charCodeAt(at).toString(16).toUpperCase().padStart(4, '0')
    problems.push(`line ${i + 1}: raw U+${code} in "${showControlChars(line.slice(Math.max(0, at - 40), at + 40))}"`)
  }
  return problems
}

/** Every problem in the text files under `outDir`, each prefixed with its file. */
export function checkDistText(outDir: string): string[] {
  return fs.readdirSync(outDir, { withFileTypes: true, recursive: true })
    .filter(e => e.isFile() && TEXT_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map(e => path.join(e.parentPath, e.name))
    .sort()
    .flatMap(file => controlCharProblems(fs.readFileSync(file, 'utf8')).map(p => `${path.relative(outDir, file)}: ${p}`))
}
