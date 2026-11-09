// Write a flat SVG of a panel, to look at a size / medallion / palette without a renderer.
//   node scripts/preview.mjs [size] [medallion] [out.svg] [KEY=#rrggbb ...]
import { writeFileSync } from 'node:fs';
import { buildPanel } from '../src/index.js';

const [size = '10', medallion = 'moorish', out = 'panel.svg', ...rest] = process.argv.slice(2);
const palette = Object.fromEntries(rest.map(a => a.split('=')));
const p = buildPanel({ size: Number(size), medallion, palette });
const o = p.panel.outer, f = v => v.toFixed(3);
const paths = {};
for (const q of p.pieces) (paths[q.key] ??= []).push('M' + q.poly.map(([x, y]) => `${f(x)} ${f(-y)}`).join('L') + 'Z');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-o} ${-o} ${2 * o} ${2 * o}" width="1400" height="1400">
<rect x="${-o}" y="${-o}" width="${2 * o}" height="${2 * o}" fill="#b9ad98"/>
${Object.entries(paths).map(([k, d]) => `<path fill="${p.palette[k]}" d="${d.join('')}"/>`).join('\n')}
</svg>`;
writeFileSync(out, svg);
console.log(`${out}: size ${size}, ${medallion}, ${p.pieces.length} pieces`, p.stats.byKey);
