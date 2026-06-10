// Wstrzykuje dane_godzinowe.json do symulator_promocji_NEXBE.html.
// Czyta plik z dysku i podmienia linię `const HOURLY = {...};` (z dodanym polem d).
// Uruchom: node inject_hourly.js
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const jsonPath = path.join(dir, 'dane_godzinowe.json');
const htmlPath = path.join(dir, 'symulator_promocji_NEXBE.html');

const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Pola w kolejności oczekiwanej przez aplikację + nowe pole d (indeks dnia 0..N).
const fields = ['d', 'mo', 'wk', 'h', 'rdn', 'cons', 'pvk'];
const out = {};
for (const f of fields) {
  if (!Array.isArray(raw[f])) throw new Error('Brak tablicy ' + f + ' w JSON');
  out[f] = raw[f];
}
const lens = new Set(fields.map(f => out[f].length));
if (lens.size !== 1) throw new Error('Niespójne długości tablic: ' + JSON.stringify([...lens]));

const newLine = 'const HOURLY = ' + JSON.stringify(out) + ';';

const html = fs.readFileSync(htmlPath, 'utf8');
const lines = html.split('\n');
let idx = lines.findIndex(l => l.startsWith('const HOURLY = '));
if (idx < 0) throw new Error('Nie znaleziono linii `const HOURLY = `');
const oldLine = lines[idx];
lines[idx] = newLine;
fs.writeFileSync(htmlPath, lines.join('\n'), 'utf8');

console.log('OK: podmieniono HOURLY w', path.basename(htmlPath));
console.log('  godzin =', [...lens][0], '| pola =', fields.join(','));
console.log('  stara linia (bajty) =', Buffer.byteLength(oldLine, 'utf8'));
console.log('  nowa  linia (bajty) =', Buffer.byteLength(newLine, 'utf8'));
console.log('  zakres d =', Math.min(...out.d), '..', Math.max(...out.d));
