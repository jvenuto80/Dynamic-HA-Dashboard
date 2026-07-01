#!/usr/bin/env node
/**
 * Bump the project version in every place that has to agree, in one shot.
 *
 *   node scripts/release.mjs 1.7.2     # explicit version
 *   node scripts/release.mjs patch     # 1.7.1 -> 1.7.2
 *   node scripts/release.mjs minor     # 1.7.1 -> 1.8.0
 *   node scripts/release.mjs major     # 1.7.1 -> 2.0.0
 *
 * Updates package.json, package-lock.json, and addon/config.yaml together.
 * Home Assistant reads the version from addon/config.yaml; npm reads it from
 * package.json — keeping them in lockstep is the whole point (a drift here is
 * what shipped 1.7.1 without HA noticing).
 *
 * Refuses to run unless addon/CHANGELOG.md already has a "## <version>" entry,
 * so no release goes out without notes — the release workflow publishes those
 * notes to GitHub when the tag is pushed.
 *
 * Stages the changed files but does NOT commit or tag. After reviewing:
 *   git commit -am "Release <version>"
 *   git tag v<version>
 *   git push && git push origin v<version>
 * Pushing the tag triggers .github/workflows/release.yml.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const paths = {
  pkg: new URL('package.json', root),
  lock: new URL('package-lock.json', root),
  cfg: new URL('addon/config.yaml', root),
};

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const arg = process.argv[2];
if (!arg) fail('Usage: node scripts/release.mjs <version|patch|minor|major>');

// ── Resolve the target version ───────────────────────────────────────────────
const pkgText = readFileSync(paths.pkg, 'utf8');
const current = JSON.parse(pkgText).version;
if (!/^\d+\.\d+\.\d+$/.test(current)) fail(`package.json version "${current}" is not x.y.z`);

let next;
if (['patch', 'minor', 'major'].includes(arg)) {
  const [maj, min, pat] = current.split('.').map(Number);
  next = arg === 'major' ? `${maj + 1}.0.0` : arg === 'minor' ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
} else {
  next = arg.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(next)) fail(`"${arg}" is not a valid x.y.z version or bump keyword`);
}

if (next === current) fail(`version is already ${next}`);

// ── Require a changelog entry before touching anything ───────────────────────
try {
  execFileSync('node', ['scripts/changelog-section.mjs', next], { cwd: root, stdio: 'ignore' });
} catch {
  fail(
    `addon/CHANGELOG.md has no "## ${next}" section.\n` +
      `  Add the release notes there first, then re-run this.`,
  );
}

// ── Rewrite the version in each file (targeted, format-preserving edits) ──────
// package.json — the first "version" field.
writeFileSync(paths.pkg, pkgText.replace(/("version":\s*")\d+\.\d+\.\d+(")/, `$1${next}$2`));

// package-lock.json — only the two project-level version fields (right after the
// ha-dashboard name), never a dependency that happens to share the number.
const lockText = readFileSync(paths.lock, 'utf8');
const escaped = current.replace(/\./g, '\\.');
writeFileSync(
  paths.lock,
  lockText.replace(
    new RegExp(`("name":\\s*"ha-dashboard",\\s*"version":\\s*")${escaped}(")`, 'g'),
    `$1${next}$2`,
  ),
);

// addon/config.yaml — the single top-level version line.
const cfgText = readFileSync(paths.cfg, 'utf8');
writeFileSync(paths.cfg, cfgText.replace(/^(version:\s*")\d+\.\d+\.\d+(")/m, `$1${next}$2`));

// ── Verify all three now agree, then stage ───────────────────────────────────
const readCfg = readFileSync(paths.cfg, 'utf8').match(/^version:\s*"?([^"\n]+)"?/m)?.[1];
const readPkg = JSON.parse(readFileSync(paths.pkg, 'utf8')).version;
if (readPkg !== next || readCfg !== next) {
  fail(`post-edit mismatch (package.json=${readPkg}, config.yaml=${readCfg}, expected ${next})`);
}

execFileSync('git', ['add', 'package.json', 'package-lock.json', 'addon/config.yaml'], { cwd: root });

console.log(`✓ Bumped ${current} → ${next} in package.json, package-lock.json, addon/config.yaml (staged).`);
console.log(`
Next:
  git commit -am "Release ${next}"
  git tag v${next}
  git push && git push origin v${next}
`);
