import { Buffer } from 'node:buffer';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve relative to this script so the command works from any checkout —
// absolute paths here would read and overwrite whichever tree they named.
const HERE = dirname(fileURLToPath(import.meta.url)); // apps/mobile/scripts
const REPO = join(HERE, '..', '..', '..');
const SRC = join(REPO, 'backend/studies/seed/musicxml');
const OUT = join(HERE, '..', 'src/data/musicxmlCatalog.ts');

const files = readdirSync(SRC).filter((f) => f.endsWith('.musicxml')).sort();
if (files.length === 0) throw new Error(`no .musicxml files under ${SRC}`);

/** Collapse inter-tag whitespace + drop the XML/DOCTYPE prolog the parser ignores. */
function minify(xml) {
  return xml
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

const entries = files.map((f) => {
  const id = f.replace(/\.musicxml$/, '');
  const xml = minify(readFileSync(join(SRC, f), 'utf8'));
  // Backtick-safe: escape backslashes and backticks and ${ sequences.
  const esc = xml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return `  '${id}': \`${esc}\`,`;
});

/** "Studies 1-6, 9" — derived from the ids so it can't go stale. */
const coverage = (() => {
  const counts = new Map();
  for (const f of files) {
    const s = Number(f.split('-')[1]);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => a - b).join(', ');
})();

const header = `/**
 * Bundled Clarke MusicXML notation, keyed by exercise id (\`clarke-{section}-{local}\`).
 *
 * GENERATED — do not edit by hand. Mirrors \`backend/studies/seed/musicxml/*.musicxml\`
 * (the OMR output from the 1912 Clarke scan) so the mobile app can render real
 * notation before the \`/api/studies/\` endpoint serves \`StudyContent.musicxml\`.
 * Inter-tag whitespace and the XML/DOCTYPE prolog are stripped; the parser in
 * \`@/lib/musicxml\` reads the same subset either way. Regenerate with
 * \`scripts/gen-musicxml.mjs\` when the backend notation changes.
 *
 * ${files.length} studies, covering Clarke ${coverage}. Exercises without a
 * scored source are absent here and render the "notation unavailable" state.
 */
export const MUSICXML_BY_ID: Readonly<Record<string, string>> = {
`;

writeFileSync(OUT, header + entries.join('\n') + '\n};\n');
console.log(`Wrote ${files.length} studies to ${OUT}`);
const bytes = Buffer.byteLength(header + entries.join('\n'));
console.log(`Module size: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
