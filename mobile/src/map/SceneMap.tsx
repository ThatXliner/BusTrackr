import {memo, useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {WebView} from 'react-native-webview';
import {colors} from '../styles';
import {type EstimatedPrediction} from '../shuttle/feed';
import {sceneEventSchema, sceneState, type SceneCommand} from './protocol';
import packagedScene from './scene.generated.json';

const source = {html: packagedScene.html, baseUrl: 'about:blank'};
const presets = [
  {view: 'campus', label: 'Campus'}, {view: 'route', label: 'Full route'},
  {view: 'fehren', label: 'Fehren'}, {view: 'buildings', label: 'Buildings'}, {view: 'sports', label: 'Sports'},
] satisfies {view: Extract<SceneCommand, {kind: 'camera'}>['view']; label: string}[];
type LoadState = {kind: 'loading'} | {kind: 'ready'} | {kind: 'error'; message: string};
type Props = {prediction: EstimatedPrediction | null; checkedAt: string | null; expanded: boolean; onExpand: () => void};

export const SceneMap = memo(function SceneMap({prediction, checkedAt, expanded, onExpand}: Props) {
  const web = useRef<WebView>(null);
  const [load, setLoad] = useState<LoadState>({kind: 'loading'});
  const [attempt, setAttempt] = useState(0);
  const [orbit, setOrbit] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const {height} = useWindowDimensions();
  const send = useCallback((command: SceneCommand) => {
    web.current?.injectJavaScript(`window.BusTrackrScene?.receive(${JSON.stringify(command)});true;`);
  }, []);
  useEffect(() => {
    const listener = AppState.addEventListener('change', next => {
      const foreground = next === 'active';
      setActive(foreground);
      send({kind: 'state', marker: null, expiresAt: 0, active: foreground});
    });
    return () => listener.remove();
  }, [send]);
  useEffect(() => {
    if (load.kind !== 'ready') return;
    send(sceneState(prediction, checkedAt, active, Date.now()));
  }, [prediction, checkedAt, active, load.kind, send]);
  useEffect(() => {
    if (load.kind === 'ready') send({kind: 'orbit', enabled: orbit});
  }, [load.kind, orbit, send]);
  useEffect(() => {
    if (load.kind !== 'loading') return;
    const timeout = setTimeout(() => setLoad({kind: 'error', message: 'The 3D scene took too long to load.'}), 60_000);
    return () => clearTimeout(timeout);
  }, [attempt, load.kind]);
  function fail(message: string) {setLoad({kind: 'error', message});}
  const enabled = load.kind === 'ready';
  return <View style={[styles.section, expanded && styles.expanded]}>
    <View style={styles.controls}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlRow}>
        {presets.map(preset => <Pressable key={preset.view} accessibilityRole="button" accessibilityLabel={`3D view: ${preset.label}`} disabled={!enabled} onPress={() => send({kind: 'camera', view: preset.view})} style={[styles.button, !enabled && styles.disabled]}><Text style={styles.buttonText}>{preset.label}</Text></Pressable>)}
      </ScrollView>
    </View>
    <View style={[styles.viewport, expanded ? styles.expanded : {height: Math.max(280, height * .40)}]}>
      <WebView key={attempt} ref={web} source={source} style={styles.web}
        originWhitelist={['*']} onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
        javaScriptEnabled scrollEnabled={false} bounces={false} overScrollMode="never"
        allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
        setSupportMultipleWindows={false} mixedContentMode="never"
        onError={() => fail('The 3D map could not load.')} onContentProcessDidTerminate={() => fail('The map renderer stopped. Reload the scene.')}
        onRenderProcessGone={() => fail('The map renderer stopped. Reload the scene.')}
        onMessage={event => {
          try {
            const input: unknown = JSON.parse(event.nativeEvent.data);
            const parsed = sceneEventSchema.safeParse(input);
            if (!parsed.success) return;
            if (parsed.data.kind === 'ready') setLoad({kind: 'ready'});
            else fail(parsed.data.message);
          } catch {fail('The map returned an invalid response.');}
        }}/>
      {load.kind !== 'ready' && <View style={styles.loading}>
        {load.kind === 'loading' ? <><ActivityIndicator color={colors.teal}/><Text style={styles.loadingTitle}>Building your 3D campus</Text><Text style={styles.note}>Loading the bundled terrain, buildings and route.</Text></> : <>
          <Text style={styles.loadingTitle}>3D map unavailable</Text><Text style={styles.note}>{load.message}</Text>
          <Pressable accessibilityRole="button" onPress={() => {setLoad({kind: 'loading'}); setAttempt(value => value + 1);}} style={styles.button}><Text style={styles.buttonText}>Reload 3D map</Text></Pressable>
        </>}
      </View>}
      <View style={styles.zoom}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom into 3D map" disabled={!enabled} onPress={() => send({kind: 'zoom', factor: .75})} style={styles.button}><Text style={styles.zoomText}>+</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out of 3D map" disabled={!enabled} onPress={() => send({kind: 'zoom', factor: 1.25})} style={styles.button}><Text style={styles.zoomText}>−</Text></Pressable>
      </View>
      <View pointerEvents="none" style={styles.mapLabel}><Text style={styles.mapLabelText}>{prediction ? 'AMBER = ESTIMATE · NOT GPS' : 'NO POSITION ESTIMATE'}</Text></View>
    </View>
    <View style={styles.toolbar}>
      <Pressable accessibilityRole="button" accessibilityLabel={orbit ? 'Switch map to pan' : 'Switch map to orbit'} accessibilityState={{selected: orbit}} disabled={!enabled} onPress={() => setOrbit(value => !value)} style={styles.button}><Text style={styles.buttonText}>{orbit ? 'Orbit' : 'Pan'} ↔</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Locate estimate on 3D map" disabled={!enabled || !prediction} onPress={() => send({kind: 'camera', view: 'estimate'})} style={[styles.button, (!enabled || !prediction) && styles.disabled]}><Text style={styles.buttonText}>Locate estimate</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onExpand} style={styles.button}><Text style={styles.buttonText}>{expanded ? 'Show details' : 'Expand map'}</Text></Pressable>
    </View>
    <Text style={styles.attribution}>© OpenStreetMap contributors · USGS terrain · Modeled scenery</Text>
  </View>;
});
const styles = StyleSheet.create({
  section: {backgroundColor: colors.paper}, expanded: {flex: 1},
  controls: {paddingHorizontal: 12, paddingVertical: 5}, controlRow: {gap: 6},
  button: {minHeight: 44, minWidth: 44, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line},
  buttonText: {fontSize: 12, fontWeight: '700', color: colors.teal}, disabled: {opacity: .4},
  viewport: {backgroundColor: '#d9e1db'}, web: {flex: 1, backgroundColor: '#d9e1db'},
  toolbar: {flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8, gap: 6, justifyContent: 'space-between'},
  zoom: {position: 'absolute', right: 12, top: 12, gap: 6}, zoomText: {fontSize: 22, color: colors.teal},
  mapLabel: {position: 'absolute', bottom: 10, left: 12, backgroundColor: '#FFFDF8ED', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6},
  mapLabelText: {fontSize: 10, fontWeight: '800', letterSpacing: .5, color: colors.ink},
  attribution: {fontSize: 9, color: colors.muted, paddingHorizontal: 12, paddingVertical: 6},
  loading: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, padding: 24, gap: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.paper},
  loadingTitle: {fontSize: 20, fontWeight: '700', color: colors.ink}, note: {fontSize: 14, color: colors.muted, textAlign: 'center'},
});
