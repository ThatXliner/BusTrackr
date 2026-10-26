import {createWorld} from './world';
import {commandSchema, markerIsCurrent, type SceneCommand} from '../mobile/src/map/protocol';

declare global {
  interface Window {
    ReactNativeWebView?: {postMessage: (message: string) => void};
    BusTrackrScene?: {receive: (input: unknown) => void};
  }
}
const host = document.getElementById('world');
if (!(host instanceof HTMLDivElement)) throw new Error('Missing scene host');
const post = (event: {kind: 'ready'} | {kind: 'error'; message: string}) => window.ReactNativeWebView?.postMessage(JSON.stringify(event));
let state: Extract<SceneCommand, {kind: 'state'}> = {kind: 'state', marker: null, expiresAt: 0, active: true};
let world: Awaited<ReturnType<typeof createWorld>> | null = null;
let expiry: ReturnType<typeof setTimeout> | undefined;
function applyState() {
  clearTimeout(expiry);
  const visible = markerIsCurrent(state, Date.now());
  world?.setEstimate(visible ? state.marker : null);
  world?.setRenderingActive(state.active);
  if (visible) expiry = setTimeout(() => world?.setEstimate(null), Math.max(0, state.expiresAt - Date.now()));
}
window.BusTrackrScene = {receive(input) {
  const result = commandSchema.safeParse(input);
  if (!result.success) return;
  const command = result.data;
  switch (command.kind) {
    case 'state': state = command; applyState(); break;
    case 'orbit': world?.setOrbitMode(command.enabled); break;
    case 'zoom': world?.zoom(command.factor); break;
    case 'camera':
      if (!world) return;
      switch (command.view) {
        case 'campus': world.focusStop('campus'); break;
        case 'route': world.reset(); break;
        case 'fehren': world.focusStop('lot'); break;
        case 'buildings': world.inspectCampus(); break;
        case 'sports': world.inspectFacilities(); break;
        case 'estimate': if (markerIsCurrent(state, Date.now())) world.focusEstimate(); break;
      }
  }
}};
let ready = false;
void createWorld(host, () => {
  if (!ready) {ready = true; post({kind: 'ready'});}
}, message => post({kind: 'error', message}), {tracking: true, embedded: true}).then(created => {
  world = created;
  applyState();
}).catch(error => post({kind: 'error', message: error instanceof Error ? error.message : 'Could not load the 3D scene.'}));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {state = {...state, marker: null}; applyState();}
});
window.addEventListener('pagehide', () => {clearTimeout(expiry); world?.dispose(); world = null;});
