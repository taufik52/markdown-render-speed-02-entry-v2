import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from './parse.js';

// Driver for the markdown-render-speed-02 harness: read every case from
// /input/cases.json, render each markdown string with parse(), and write
// the HTML strings (in the same order) as a JSON array to /output/html.json.
const cases = JSON.parse(readFileSync('/input/cases.json', 'utf8'));
const html = new Array(cases.length);
for (let i = 0; i < cases.length; i++) {
  html[i] = parse(cases[i].markdown);
}
mkdirSync('/output', { recursive: true });
writeFileSync('/output/html.json', JSON.stringify(html));
