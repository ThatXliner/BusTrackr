import assert from 'node:assert/strict';
import {test} from 'node:test';
import {feedSchema, parseEndpoint, present, retainObservation, type RequestState} from '../src/shuttle/feed';
import {sampleState, scenarios} from '../src/shuttle/samples';

const now = Date.parse('2026-10-26T21:00:00Z');
const context = {sourceKey: 'sample:estimated', now, active: true};
function ready() {
  const state = sampleState('estimated', now);
  assert.equal(state.kind, 'ready');
  if (state.kind !== 'ready') throw new Error('Expected ready sample');
  return state;
}
test('sample scenarios show estimates only for eligible runs', () => {
  for (const scenario of scenarios) {
    const state = sampleState(scenario.id, now);
    if (state.kind !== 'loading' && state.feed) feedSchema.parse(state.feed);
    const view = present(state, {...context, sourceKey: state.sourceKey});
    const expected: Record<string, string> = {inbound: 'estimated', offline: 'unavailable', empty: 'unknown'};
    assert.equal(view.kind, expected[scenario.id] ?? scenario.id);
  }
});
test('unknown JSON rejects malformed times, bounds, ranges and unsupported states', () => {
  const feed = ready().feed;
  for (const patch of [
    {generatedAt: 'not a time'}, {status: 'live'}, {rangeSeconds: [400, 200]},
    {rangeSeconds: [-10, 200]}, {marker: {direction: 'outbound', lower: .8, progress: .5, upper: .9}},
    {marker: {direction: 'inbound', lower: 0, progress: .5, upper: 1}},
  ]) assert.equal(feedSchema.safeParse({...feed, prediction: {...feed.prediction, ...patch}}).success, false);
  assert.equal(feedSchema.safeParse({...feed, latest: {checkpoint: 'BEI', receivedAt: 'today'}}).success, false);
});
test('offline overrides may carry leftover estimate fields without exposing them', () => {
  const state = ready();
  state.feed = feedSchema.parse({...state.feed, prediction: {...state.feed.prediction, status: 'offline', marker: null}});
  assert.equal(present(state, context).kind, 'unavailable');
  assert.equal('rangeSeconds' in state.feed.prediction, false);
});
test('stale response, mailbox, future clock and background hide both ETA and marker', () => {
  const state = ready();
  assert.equal(present(state, {...context, active: false}).kind, 'stale');
  assert.equal(present(state, {...context, now: now + 46_000}).kind, 'stale');
  assert.equal(present({...state, fetchedAt: now - 46_000}, context).kind, 'stale');
  for (const age of [-121_000, 31_000]) {
    assert.equal(present({...state, feed: {...state.feed, lastCheckedAt: new Date(now + age).toISOString()}}, context).kind, 'stale');
  }
  assert.equal(present({...state, feed: {...state.feed, status: 'disconnected'}}, context).kind, 'unavailable');
});
test('endpoint changes and failed requests cannot keep the old prediction visible', () => {
  const state = ready();
  assert.equal(present(state, {...context, sourceKey: 'https://new.example/api/shuttle'}).kind, 'loading');
  const failed: RequestState = {kind: 'failed', sourceKey: state.sourceKey, feed: state.feed};
  assert.equal(present(failed, context).kind, 'unavailable');
});
test('old camera observation does not mean stale feed; missing event time stays missing', () => {
  const state = ready();
  state.feed.latest = {checkpoint: 'BEI', eventAt: new Date(now - 86_400_000).toISOString(), receivedAt: new Date(now - 86_400_000).toISOString()};
  assert.equal(present(state, context).kind, 'estimated');
  state.feed.latest = {checkpoint: 'BEI', receivedAt: new Date(now).toISOString()};
  assert.equal(feedSchema.parse(state.feed).latest?.eventAt, undefined);
});
test('range ages from generation time and expired run never implies arrival', () => {
  const state = ready();
  const view = present(state, {...context, now: now + 30_000});
  assert.equal(view.kind, 'estimated');
  if (view.kind === 'estimated') assert.deepEqual(view.rangeMinutes, [2, 7]);
  assert.equal(state.feed.prediction.status, 'estimated');
  if (state.feed.prediction.status === 'estimated') state.feed.prediction.estimatedArrivalAt = new Date(now - 1).toISOString();
  assert.equal(present(state, context).kind, 'unknown');
});
test('endpoint settings reject credentials and insecure production URLs', () => {
  assert.equal(parseEndpoint(' https://shuttle.example.org '), 'https://shuttle.example.org/api/shuttle');
  assert.equal(parseEndpoint('http://192.168.1.3:8787', true), 'http://192.168.1.3:8787/api/shuttle');
  for (const input of ['http://shuttle.example.org', 'https://user:secret@shuttle.example.org', 'https://shuttle.example.org?token=abc', 'https://shuttle.example.org/#token', 'file:///tmp/status', 'https://shuttle.example.org/wrong']) assert.throws(() => parseEndpoint(input));
  assert.throws(() => parseEndpoint('http://192.168.1.3:8787'));
});

test('same-source refresh preserves the observation without restoring an estimate', () => {
  const previous = ready();
  const loading = retainObservation(previous, {kind: 'loading', sourceKey: previous.sourceKey, feed: null});
  const failed = retainObservation(loading, {kind: 'failed', sourceKey: previous.sourceKey, feed: null});
  assert.equal(failed.feed?.latest?.checkpoint, previous.feed.latest?.checkpoint);
  assert.equal(present(failed, context).kind, 'unavailable');
  assert.equal(retainObservation(previous, {kind: 'loading', sourceKey: 'another-feed', feed: null}).feed, null);
});
test('HTTP development exception requires an actual local host', () => {
  for (const host of ['10.attacker.example', '192.168.attacker.example', '172.16.attacker.example']) {
    assert.throws(() => parseEndpoint(`http://${host}/api/shuttle`, true));
  }
});
