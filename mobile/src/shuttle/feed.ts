import {z} from 'zod';

const timestamp = z.iso.datetime({offset: true});
const direction = z.enum(['inbound', 'outbound']);
const marker = z.object({
  direction,
  progress: z.number().min(0).max(1),
  lower: z.number().min(0).max(1),
  upper: z.number().min(0).max(1),
}).refine(value => value.lower <= value.progress && value.progress <= value.upper);
const base = {generatedAt: timestamp};
const estimated = z.object({
  ...base,
  status: z.literal('estimated'),
  direction,
  anchor: z.enum(['camera', 'schedule']),
  rangeSeconds: z.tuple([z.number().nonnegative(), z.number().nonnegative()])
    .refine(([low, high]) => low <= high),
  rangeKind: z.literal('heuristic-not-calibrated'),
  estimatedArrivalAt: timestamp,
  historyCount: z.number().int().nonnegative(),
  marker,
}).refine(value => value.direction === value.marker.direction);
const prediction = z.union([
  estimated,
  z.object({
    ...base,
    status: z.enum(['unconfigured', 'ambiguous', 'scheduled', 'unknown', 'offline']),
    marker: z.null(),
    nextCrossingAt: timestamp.nullish(),
  }),
]);
export const feedSchema = z.object({
  status: z.enum(['connected', 'sample', 'connecting', 'disconnected']),
  lastCheckedAt: timestamp.nullable(),
  latest: z.object({
    checkpoint: z.string().trim().min(1).max(200),
    eventAt: timestamp.nullish(),
    receivedAt: timestamp,
  }).nullable(),
  eventCount: z.number().int().nonnegative(),
  prediction,
});
export type ShuttleFeed = z.infer<typeof feedSchema>;
export type EstimatedPrediction = z.infer<typeof estimated>;
export type RequestState =
  | {kind: 'loading'; sourceKey: string; feed: ShuttleFeed | null}
  | {kind: 'ready'; sourceKey: string; feed: ShuttleFeed; fetchedAt: number}
  | {kind: 'failed'; sourceKey: string; feed: ShuttleFeed | null};
export type Presentation =
  | {kind: 'loading' | 'unavailable' | 'stale' | 'unconfigured' | 'ambiguous' | 'unknown'}
  | {kind: 'scheduled'; nextCrossingAt: string | null}
  | {kind: 'estimated'; prediction: EstimatedPrediction; rangeMinutes: [number, number]};

export function retainObservation(previous: RequestState, next: RequestState): RequestState {
  if (previous.sourceKey === next.sourceKey && next.kind !== 'ready' && !next.feed) {
    return {...next, feed: previous.feed};
  }
  return next;
}

export const freshness = {responseMs: 45_000, mailboxMs: 120_000, clockToleranceMs: 30_000};
function current(stamp: string | null, now: number, maxAge: number) {
  if (!stamp) return false;
  const age = now - Date.parse(stamp);
  return age >= -freshness.clockToleranceMs && age <= maxAge;
}
export function present(state: RequestState, context: {sourceKey: string; now: number; active: boolean}): Presentation {
  if (state.sourceKey !== context.sourceKey || state.kind === 'loading') return {kind: 'loading'};
  if (state.kind === 'failed') return {kind: 'unavailable'};
  const {feed} = state;
  if (feed.status === 'disconnected' || feed.status === 'connecting') return {kind: 'unavailable'};
  if (!context.active || context.now - state.fetchedAt > freshness.responseMs ||
      !current(feed.lastCheckedAt, context.now, freshness.mailboxMs) ||
      !current(feed.prediction.generatedAt, context.now, freshness.responseMs)) return {kind: 'stale'};
  const prediction = feed.prediction;
  switch (prediction.status) {
    case 'estimated': {
      const elapsed = Math.max(0, (context.now - Date.parse(prediction.generatedAt)) / 1000);
      if (Date.parse(prediction.estimatedArrivalAt) <= context.now) return {kind: 'unknown'};
      return {kind: 'estimated', prediction, rangeMinutes: [
        Math.floor(Math.max(0, prediction.rangeSeconds[0] - elapsed) / 60),
        Math.ceil(Math.max(0, prediction.rangeSeconds[1] - elapsed) / 60),
      ]};
    }
    case 'offline': return {kind: 'unavailable'};
    case 'scheduled': return {kind: 'scheduled', nextCrossingAt: prediction.nextCrossingAt ?? null};
    case 'unconfigured': case 'ambiguous': case 'unknown': return {kind: prediction.status};
  }
}
export function parseEndpoint(input: string, allowLocalHttp = false): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('Enter a complete HTTPS URL ending in /api/shuttle.'); }
  const octets = url.hostname.split('.').map(Number);
  const ipv4 = /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) && octets.every(value => value >= 0 && value <= 255);
  const privateIp = ipv4 && (octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31));
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || privateIp || url.hostname.endsWith('.local');
  if (url.protocol !== 'https:' && !(allowLocalHttp && local && url.protocol === 'http:')) {
    throw new Error('Use HTTPS. Development builds also allow HTTP on your local network.');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('Use a public status URL without passwords, tokens, query parameters or fragments.');
  if (url.pathname === '/') url.pathname = '/api/shuttle';
  if (url.pathname !== '/api/shuttle') throw new Error('The status URL must end in /api/shuttle.');
  return url.toString();
}
export function pacificTime(stamp: string): string {
  return new Date(stamp).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}
