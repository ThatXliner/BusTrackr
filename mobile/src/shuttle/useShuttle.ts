import {useEffect, useState} from 'react';
import {AppState} from 'react-native';
import {present, retainObservation, type RequestState} from './feed';
import {sampleState, sourceKey, type Source} from './samples';
import {startFeedSession} from './poll';

export function useShuttle(source: Source) {
  const key = sourceKey(source);
  const [state, setState] = useState<RequestState>({kind: 'loading', sourceKey: key, feed: null});
  const [now, setNow] = useState(() => Date.now());
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const listener = AppState.addEventListener('change', next => {
      setActive(next === 'active');
      setNow(Date.now());
      setState(previous => retainObservation(previous, {kind: 'loading', sourceKey: key, feed: null}));
    });
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {listener.remove(); clearInterval(clock);};
  }, [key]);
  useEffect(() => {
    if (!active) return;
    if (source.kind === 'sample') {
      const update = () => setState(sampleState(source.scenario, Date.now()));
      update();
      const timer = setInterval(update, 10_000);
      return () => clearInterval(timer);
    }
    return startFeedSession(source.endpoint, next => setState(previous => retainObservation(previous, next)));
  }, [source, active, revision]);
  const view = present(state, {sourceKey: key, now, active});
  const feed = state.sourceKey === key ? state.feed : null;
  return {view, feed, now, refresh: () => setRevision(value => value + 1)};
}
