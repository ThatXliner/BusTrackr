import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const ROUTES_PATH = resolve(PROJECT_ROOT, 'public/data/routes.json');
const PROFILES_PATH = resolve(PROJECT_ROOT, 'public/local-scene/road-profiles.json');
const FAILURE_HINT = 'Run python3 scripts/build-road-profiles.py after route changes';

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch (error) {
    throw new Error(`Invalid ${label}: ${error instanceof Error ? error.message : error}`);
  }
}

export function checkRoadProfiles(routesBytes, profiles) {
  const routesSha256 = createHash('sha256').update(routesBytes).digest('hex');
  assertCondition(profiles && typeof profiles === 'object' && !Array.isArray(profiles), 'profile root must be an object');
  assertCondition(profiles.routesSha256 === routesSha256, `routesSha256 mismatch (expected ${routesSha256})`);

  const routes = parseJson(routesBytes, 'routes.json');
  assertCondition(routes && typeof routes === 'object' && !Array.isArray(routes), 'route root must be an object');

  const counts = {};
  for (const direction of ['inbound', 'outbound']) {
    assertCondition(Array.isArray(routes[direction]), `routes.${direction} must be an array`);
    assertCondition(Array.isArray(profiles[direction]), `profiles.${direction} must be an array`);
    const expectedCount = routes[direction].length - 1;
    assertCondition(
      profiles[direction].length === expectedCount,
      `${direction} profile count ${profiles[direction].length} does not match route segment count ${expectedCount}`,
    );
    counts[direction] = profiles[direction].length;

    profiles[direction].forEach((profile, index) => {
      assertCondition(profile && typeof profile === 'object' && !Array.isArray(profile), `${direction}[${index}] must be an object`);
      assertCondition(Number.isFinite(profile.width) && profile.width > 0, `${direction}[${index}] width must be finite and positive`);
      assertCondition(Number.isInteger(profile.lanes) && profile.lanes >= 2, `${direction}[${index}] lanes must be an integer >= 2`);
      assertCondition(typeof profile.name === 'string', `${direction}[${index}] name must be a string`);
      assertCondition(typeof profile.highway === 'string', `${direction}[${index}] highway must be a string`);
      assertCondition(typeof profile.curb === 'boolean', `${direction}[${index}] curb must be boolean`);
      assertCondition(profile.wayId === null || Number.isInteger(profile.wayId), `${direction}[${index}] wayId must be an integer or null`);
    });
  }

  return { routesSha256, counts };
}

function run() {
  try {
    const routesBytes = readFileSync(ROUTES_PATH);
    const profiles = parseJson(readFileSync(PROFILES_PATH), 'road-profiles.json');
    const result = checkRoadProfiles(routesBytes, profiles);
    console.log(`Road profile check passed (${result.counts.inbound} inbound, ${result.counts.outbound} outbound; routesSha256 ${result.routesSha256})`);
  } catch (error) {
    console.error(`Road profile check failed: ${error instanceof Error ? error.message : error}`);
    console.error(FAILURE_HINT);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) run();
