// Group entities under their nearest titled section per view.
import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('./lovelace-dump.json', import.meta.url), 'utf8'));

function collectEntities(card, acc) {
  if (!card || typeof card !== 'object') return;
  if (typeof card.entity === 'string') acc.push(card.entity);
  if (typeof card.entity_id === 'string') acc.push(card.entity_id);
  if (Array.isArray(card.entities))
    for (const e of card.entities) acc.push(typeof e === 'string' ? e : e && e.entity);
  for (const key of ['cards', 'sections', 'badges'])
    if (Array.isArray(card[key])) for (const c of card[key]) collectEntities(c, acc);
}

function walk(node, currentTitle, groups) {
  if (!node || typeof node !== 'object') return;
  const title = node.title || currentTitle;
  // a "section" / titled container: collect its direct entities
  if (node.title) {
    const acc = [];
    collectEntities(node, acc);
    const clean = [...new Set(acc.filter(Boolean))];
    if (clean.length) groups[node.title] = [...new Set([...(groups[node.title] || []), ...clean])];
  }
  for (const key of ['cards', 'sections'])
    if (Array.isArray(node[key])) for (const c of node[key]) walk(c, title, groups);
}

const dash = data.dashboards.find((d) => d.title === 'Overview' || d.title === 'Overview (default)');
for (const view of dash.config.views) {
  const groups = {};
  for (const c of view.cards || []) walk(c, null, groups);
  for (const s of view.sections || []) walk(s, null, groups);
  console.log('\n#### VIEW:', view.title || view.path);
  for (const [t, ents] of Object.entries(groups)) {
    console.log('  [' + t + ']');
    for (const e of ents) console.log('     ', e);
  }
}
