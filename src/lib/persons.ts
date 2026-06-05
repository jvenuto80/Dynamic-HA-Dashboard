import type { HassEntities } from 'home-assistant-js-websocket';
import { persons as configPersons } from '../config';
import type { PersonConfig } from '../types';

/** Title-case a person entity id fragment, e.g. `john_doe` -> `John Doe`. */
function prettyId(id: string): string {
  return id
    .split('.')[1]
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * The effective list of tracked people, requiring no configuration.
 *
 * Every `person.*` entity in Home Assistant is discovered automatically and
 * labelled with its friendly name, so a fresh install shows the right people
 * with zero code. Any entry listed in `config.persons` still wins for a custom
 * display name (and ordering), so existing hand-tuned setups are preserved.
 */
export function resolvePersons(entities: HassEntities): PersonConfig[] {
  const overrides = new Map(configPersons.map((p) => [p.entity_id, p.name]));
  const discovered = Object.keys(entities).filter((id) => id.startsWith('person.'));

  // Config-listed people first (in their declared order, if they exist), then
  // any remaining auto-discovered people alphabetically.
  const orderedIds = [
    ...configPersons.filter((p) => entities[p.entity_id]).map((p) => p.entity_id),
    ...discovered.filter((id) => !overrides.has(id)).sort(),
  ];

  return orderedIds.map((id) => ({
    entity_id: id,
    name:
      overrides.get(id) ||
      (entities[id]?.attributes?.friendly_name as string | undefined) ||
      prettyId(id),
  }));
}
