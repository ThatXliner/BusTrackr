import assert from 'node:assert/strict';
import {test} from 'node:test';
import {commandSchema, markerIsCurrent, sceneState} from '../src/map/protocol';

test('scene commands validate route bounds and reject arbitrary actions', () => {
  assert(commandSchema.safeParse({kind: 'camera', view: 'campus'}).success);
  assert(!commandSchema.safeParse({kind: 'camera', view: 'https://example.com'}).success);
  assert(!commandSchema.safeParse({kind: 'zoom', factor: 100}).success);
  assert(!commandSchema.safeParse({kind: 'state', marker: {direction: 'inbound', lower: .8, progress: .4, upper: .9}, expiresAt: 100, active: true}).success);
});
test('scene expires positions even when the native bridge stops sending', () => {
  const state = {kind: 'state', marker: {direction: 'outbound', progress: .5, lower: .2, upper: .8}, active: true, expiresAt: 20_000} satisfies Parameters<typeof markerIsCurrent>[0];
  assert(markerIsCurrent(state, 10_000));
  assert(!markerIsCurrent(state, 20_000));
  assert(!markerIsCurrent({...state, active: false}, 10_000));
  assert(!markerIsCurrent({...state, expiresAt: 100_000}, 10_000));
  assert(!markerIsCurrent({...state, marker: null}, 10_000));
});

test('accepted server clock skew still produces a bounded visible map estimate', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  const prediction = {status: 'estimated', direction: 'inbound', anchor: 'camera',
    generatedAt: new Date(now + 20_000).toISOString(), estimatedArrivalAt: new Date(now + 120_000).toISOString(),
    rangeSeconds: [60, 180], rangeKind: 'heuristic-not-calibrated', historyCount: 0,
    marker: {direction: 'inbound', progress: .5, lower: .2, upper: .8},
  } satisfies NonNullable<Parameters<typeof sceneState>[0]>;
  const state = sceneState(prediction, new Date(now).toISOString(), true, now);
  assert(markerIsCurrent(state, now));
  assert(!markerIsCurrent(state, now + 45_000));
});
