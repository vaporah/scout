/**
 * Scout's version rule, kept pure and separate from the release script so it can be
 * tested directly. (The runtime version chip lives in src/version.ts; this is the
 * build-time rule that produces the number the chip reads.)
 *
 * Scout uses a plain `X.Y.Z` display version, like the one 7TV shows in the
 * extensions list, rather than a long build counter. Every position is a single
 * digit: once a position passes 9 it rolls over and carries into the next one.
 *
 *   0.6.0 -> 0.6.1 -> ... -> 0.6.9 -> 0.7.0 -> ... -> 0.9.9 -> 1.0.0
 *
 * The major position has nothing to carry into, so it simply grows.
 */

/**
 * @typedef {'patch' | 'minor' | 'major'} ReleaseKind
 * @typedef {{ major: number, minor: number, patch: number }} Version
 */

/**
 * Parse `X.Y.Z`, tolerating a missing or oversized position by clamping it.
 * @param {unknown} value
 * @returns {Version}
 */
export function parseVersion(value) {
  const parts = String(value ?? '').split('.');
  const digit = at => {
    const parsed = Number.parseInt(parts[at] ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  return { major: digit(0), minor: digit(1), patch: digit(2) };
}

/**
 * @param {Version} version
 * @returns {string}
 */
export function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/**
 * The next version for a release. `patch` is the normal case and rolls over at 9;
 * `minor` and `major` are explicit escapes for a deliberate larger release, and
 * they follow the same single-digit style.
 * @param {unknown} current
 * @param {ReleaseKind} [kind]
 * @returns {string}
 */
export function nextVersion(current, kind = 'patch') {
  const { major, minor, patch } = parseVersion(current);
  if (kind === 'major') return formatVersion({ major: major + 1, minor: 0, patch: 0 });
  if (kind === 'minor') return minor >= 9 ? formatVersion({ major: major + 1, minor: 0, patch: 0 }) : formatVersion({ major, minor: minor + 1, patch: 0 });
  // patch: step up, rolling into the minor and then the major rather than running
  // into two digits (0.6.9 -> 0.7.0, 0.9.9 -> 1.0.0).
  if (patch < 9) return formatVersion({ major, minor, patch: patch + 1 });
  if (minor < 9) return formatVersion({ major, minor: minor + 1, patch: 0 });
  return formatVersion({ major: major + 1, minor: 0, patch: 0 });
}

/**
 * True for a version in the single-digit `X.Y.Z` shape Scout ships.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isScoutVersion(value) {
  return typeof value === 'string' && /^\d+\.\d\.\d$/.test(value);
}
