import {feedSchema, type RequestState, type ShuttleFeed} from './feed';

export function startFeedSession(endpoint: string, onState: (state: RequestState) => void,
  timing = {pollMs: 10_000, timeoutMs: 10_000}) {
  let stopped = false;
  let lastFeed: ShuttleFeed | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController;
  onState({kind: 'loading', sourceKey: endpoint, feed: null});
  async function poll() {
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timing.timeoutMs);
    try {
      const response = await fetch(endpoint, {signal: controller.signal, headers: {'Cache-Control': 'no-cache'}});
      if (!response.ok) throw new Error('Status request failed');
      const raw: unknown = await response.json();
      const feed = feedSchema.parse(raw);
      if (!stopped) {
        lastFeed = feed;
        onState({kind: 'ready', sourceKey: endpoint, feed, fetchedAt: Date.now()});
      }
    } catch {
      if (!stopped) onState({kind: 'failed', sourceKey: endpoint, feed: lastFeed});
    } finally {
      clearTimeout(timeout);
      if (!stopped) timer = setTimeout(poll, timing.pollMs);
    }
  }
  void poll();
  return () => {stopped = true; clearTimeout(timer); controller?.abort();};
}
