// Extract views -> sections(title) -> ordered entities, matching the HA dashboard structure.
import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('./lovelace-dump.json', import.meta.url), 'utf8'));

const SKIP = /^(weather\.|sensor\.time|sensor\..*color_temp)/;

function findTitle(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'custom:mushroom-title-card' && node.title) return node.title;
  if (node.type && /heading/i.test(node.type) && node.heading) return node.heading;
  return null;
}

function collectEntities(node, acc, seen) {
  if (!node || typeof node !== 'object') return;
  const add = (e) => {
    if (typeof e === 'string' && e.includes('.') && !SKIP.test(e) && !seen.has(e)) {
      seen.add(e);
      acc.push(e);
    }
  };
  // skip title cards themselves
  if (node.type !== 'custom:mushroom-title-card') {
    if (typeof node.entity === 'string') add(node.entity);
    if (typeof node.entity_id === 'string') add(node.entity_id);
    if (Array.isArray(node.entities))
      for (const e of node.entities) add(typeof e === 'string' ? e : e && e.entity);
    // bubble-card sub_button entities
    if (node.sub_button && Array.isArray(node.sub_button.main))
      for (const sb of node.sub_button.main) add(sb && sb.entity);
  }
  for (const key of ['cards', 'sections', 'badges'])
    if (Array.isArray(node[key])) for (const c of node[key]) collectEntities(c, acc, seen);
}

const dash = data.dashboards.find((d) => d.title === 'Overview');
const result = [];
for (const view of dash.config.views) {
  const seen = new Set();
  const sections = [];
  const topCards = [...(view.cards || []), ...(view.sections || [])];
  for (const card of topCards) {
    // find the section title inside this stack
    let title = findTitle(card);
    if (!title && Array.isArray(card.cards)) {
      for (const c of card.cards) {
        const t = findTitle(c);
        if (t) { title = t; break; }
      }
    }
    const acc = [];
    collectEntities(card, acc, seen);
    if (acc.length) sections.push({ title: title || null, entities: acc });
  }
  result.push({ view: view.title || view.path, type: view.type, sections });
}

console.log(JSON.stringify(result, null, 2));
