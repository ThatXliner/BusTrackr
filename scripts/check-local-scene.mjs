import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), '..');
const PATHS = {
  terrain: resolve(ROOT, 'public/local-scene/elevation.json'),
  bounds: resolve(ROOT, 'public/local-scene/ground-bounds.json'),
  terrainSource: resolve(ROOT, 'public/local-scene/terrain-source.json'),
  roofs: resolve(ROOT, 'public/local-scene/roadside-roofs.json'),
  footprints: resolve(ROOT, 'public/local-scene/footprints.json'),
};

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

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function closeEnough(actual, expected, label) {
  assertCondition(finite(actual) && Math.abs(actual - expected) <= 1e-9,
    `${label} ${actual} does not match ${expected}`);
}

export function checkLocalScene({ terrain, bounds, terrainSource, roofs, footprintsBytes }) {
  assertCondition(terrain && typeof terrain === 'object' && !Array.isArray(terrain), 'terrain root must be an object');
  assertCondition(Number.isInteger(terrain.width) && terrain.width >= 2, 'terrain width must be an integer >= 2');
  assertCondition(Number.isInteger(terrain.height) && terrain.height >= 2, 'terrain height must be an integer >= 2');
  for (const field of ['west', 'north', 'dx', 'dy']) {
    assertCondition(finite(terrain[field]), `terrain ${field} must be finite`);
  }
  assertCondition(terrain.dx > 0 && terrain.dy > 0, 'terrain dx and dy must be positive');
  assertCondition(Array.isArray(terrain.values), 'terrain values must be an array');
  assertCondition(terrain.values.length === terrain.width * terrain.height, 'terrain values length does not match dimensions');
  assertCondition(terrain.values.every(finite), 'terrain values must all be finite');

  const extent = bounds?.extent ?? bounds;
  assertCondition(extent && typeof extent === 'object', 'ground bounds must be an object');
  for (const field of ['xmin', 'ymin', 'xmax', 'ymax']) {
    assertCondition(finite(extent[field]), `ground bounds ${field} must be finite`);
  }
  closeEnough(terrain.west, extent.xmin, 'terrain west');
  closeEnough(terrain.north, extent.ymax, 'terrain north');
  closeEnough(terrain.west + terrain.dx * (terrain.width - 1), extent.xmax, 'terrain east');
  closeEnough(terrain.north - terrain.dy * (terrain.height - 1), extent.ymin, 'terrain south');

  assertCondition(typeof terrainSource?.sourceLazSha256 === 'string', 'terrain source LAZ hash is missing');
  assertCondition(typeof roofs?.sourceLazSha256 === 'string', 'roof source LAZ hash is missing');
  assertCondition(terrainSource.sourceLazSha256 === roofs.sourceLazSha256, 'terrain and roof LAZ hashes differ');

  const footprints = parseJson(footprintsBytes, 'footprints.json');
  assertCondition(Array.isArray(footprints?.buildings), 'footprints buildings must be an array');
  const footprintIds = new Set(footprints.buildings.map((building) => building?.id));
  const expectedFootprintsHash = createHash('sha256').update(footprintsBytes).digest('hex');
  assertCondition(roofs?.footprintsSha256 === expectedFootprintsHash,
    `footprintsSha256 mismatch (expected ${expectedFootprintsHash})`);

  assertCondition(Array.isArray(roofs.profiles), 'roadside roof profiles must be an array');
  const seen = new Set();
  roofs.profiles.forEach((profile, index) => {
    assertCondition(profile && typeof profile === 'object' && !Array.isArray(profile), `profiles[${index}] must be an object`);
    assertCondition(Number.isInteger(profile.id), `profiles[${index}] id must be an integer`);
    assertCondition(!seen.has(profile.id), `duplicate roadside roof profile id ${profile.id}`);
    assertCondition(footprintIds.has(profile.id), `profile ${profile.id} is not in footprints.json`);
    seen.add(profile.id);
    assertCondition(Number.isInteger(profile.pointCount) && profile.pointCount >= 200,
      `profiles[${index}] pointCount must be an integer >= 200`);
    assertCondition(finite(profile.eave) && finite(profile.ridge),
      `profiles[${index}] eave and ridge must be finite`);
    assertCondition(profile.ridge >= profile.eave, `profiles[${index}] ridge must be >= eave`);
    assertCondition(profile.ridge - profile.eave <= 8, `profiles[${index}] ridge-eave spread exceeds 8 m`);
  });

  return {
    terrain: `${terrain.width}x${terrain.height}`,
    values: terrain.values.length,
    profiles: roofs.profiles.length,
    footprintsSha256: expectedFootprintsHash,
    sourceLazSha256: roofs.sourceLazSha256,
  };
}

function run() {
  try {
    const result = checkLocalScene({
      terrain: parseJson(readFileSync(PATHS.terrain), 'local elevation.json'),
      bounds: parseJson(readFileSync(PATHS.bounds), 'ground-bounds.json'),
      terrainSource: parseJson(readFileSync(PATHS.terrainSource), 'terrain-source.json'),
      roofs: parseJson(readFileSync(PATHS.roofs), 'roadside-roofs.json'),
      footprintsBytes: readFileSync(PATHS.footprints),
    });
    console.log(`Local scene check passed (${result.terrain}, ${result.values} terrain values, ${result.profiles} roof profiles)`);
  } catch (error) {
    console.error(`Local scene check failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) run();
