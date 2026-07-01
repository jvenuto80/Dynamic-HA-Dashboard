#!/usr/bin/env node
/**
 * Print the addon/CHANGELOG.md section for a single version to stdout.
 *
 * Usage:
 *   node scripts/changelog-section.mjs 1.7.1
 *   node scripts/changelog-section.mjs v1.7.1   # leading "v" is tolerated
 *
 * Exit codes: 0 = found, 1 = no matching section, 2 = bad usage.
 * Shared by scripts/release.mjs (validation) and the release workflow
 * (release notes), so both read notes the same way.
 */
import { readFileSync } from 'node:fs';

const version = process.argv[2]?.replace(/^v/, '');
if (!version) {
  console.error('Usage: node scripts/changelog-section.mjs <version>');
  process.exit(2);
}

const changelog = new URL('../addon/CHANGELOG.md', import.meta.url);
const lines = readFileSync(changelog, 'utf8').split('\n');

let capturing = false;
const body = [];
for (const line of lines) {
  const heading = line.match(/^##\s+(.+?)\s*$/);
  if (heading) {
    if (capturing) break; // hit the next version — stop
    capturing = heading[1] === version;
    continue;
  }
  if (capturing) body.push(line);
}

const notes = body.join('\n').trim();
if (!notes) {
  console.error(`No CHANGELOG section found for version "${version}".`);
  process.exit(1);
}
console.log(notes);
