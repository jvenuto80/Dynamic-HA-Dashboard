// Summarize the lovelace dump: per view, list section titles and entities.
import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('./lovelace-dump.json', import.meta.url), 'utf8'));

function entitiesOf(card, acc, titles) {
  if (!card || typeof card !== 'object') return;
  if (card.title) titles.push(card.title);
  if (typeof card.entity === 'string') acc.add(card.entity);
  if (typeof card.entity_id === 'string') acc.add(card.entity_id);
  if (Array.isArray(card.entities)) {
    for (const e of card.entities) {
      if (typeof e === 'string') acc.add(e);
      else if (e && e.entity) acc.add(e.entity);
    }
  }
  for (const key of ['cards', 'sections', 'badges']) {
    if (Array.isArray(card[key])) for (const c of card[key]) entitiesOf(c, acc, titles);
  }
}

const dash = data.dashboards.find((d) => d.title === 'Overview' || d.title === 'Overview (default)');
for (const view of dash.config.views) {
  const acc = new Set();
  const titles = [];
  for (const c of view.cards || []) entitiesOf(c, acc, titles);
  for (const s of view.sections || []) entitiesOf(s, acc, titles);
  console.log('\n==== VIEW:', view.title || view.path, '(type:', view.type + ') ====');
  if (titles.length) console.log('  titles:', [...new Set(titles)].join(' | '));
  console.log('  entities (' + acc.size + '):');
  console.log('   ', [...acc].sort().join('\n    '));
}
