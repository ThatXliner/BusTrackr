import {useEffect, useState} from 'react';
import {ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Circle, Line, Path, Rect} from 'react-native-svg';
import {pacificTime, parseEndpoint, type Presentation} from '../shuttle/feed';
import {defaultSource, loadSource, saveSource} from '../shuttle/settings';
import {scenarios, type Source} from '../shuttle/samples';
import {useShuttle} from '../shuttle/useShuttle';
import {colors, styles as s} from '../styles';

const messages = {
  loading: {title: 'Checking the feed', body: 'Looking for the latest camera observation and a usable estimate.'},
  unavailable: {title: 'Feed unavailable', body: 'The status service or mailbox is unavailable. Arrival and position estimates are hidden.'},
  stale: {title: 'Waiting for fresh data', body: 'The last update is too old to use. Arrival and position estimates are hidden until the feed refreshes.'},
  unconfigured: {title: 'No confirmed timetable', body: 'An operator needs to confirm the timetable and checkpoint direction before we can estimate arrivals.'},
  ambiguous: {title: 'No clear run match', body: 'More than one run or arrival could match. We cannot assign a vehicle position or arrival time.'},
  unknown: {title: 'No active run confirmed', body: 'An arrival is not confirmed. A missing estimate does not mean the shuttle has arrived or been cancelled.'},
  scheduled: {title: 'Waiting for the next run', body: 'The timetable lists a later checkpoint crossing. This is a schedule, not an observed arrival.'},
};
function Icon({kind, color = colors.ink}: {kind: 'bus' | 'camera' | 'settings'; color?: string}) {
  return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} accessible={false}>
    {kind === 'bus' ? <><Rect x={5} y={3} width={14} height={16} rx={3}/><Path d="M5 11h14M8 19v2m8-2v2M8 15h1m6 0h1M9 6h6"/></> :
      kind === 'camera' ? <><Rect x={3} y={7} width={18} height={13} rx={3}/><Circle cx={12} cy={13} r={3}/><Path d="m7 7 2-4h6l2 4"/></> :
        <><Path d="M4 6h16M4 12h16M4 18h16"/><Circle cx={9} cy={6} r={2} fill={colors.paper}/><Circle cx={16} cy={12} r={2} fill={colors.paper}/><Circle cx={8} cy={18} r={2} fill={colors.paper}/></>}
  </Svg>;
}
function Button({label, onPress, secondary = false}: {label: string; onPress: () => void; secondary?: boolean}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed}) => [s.button, secondary && s.secondaryButton, pressed && s.pressed]}>
    <Text style={[s.buttonText, secondary && s.secondaryButtonText]}>{label}</Text>
  </Pressable>;
}
function Route({view}: {view: Presentation}) {
  const prediction = view.kind === 'estimated' ? view.prediction : null;
  const inbound = prediction?.direction === 'inbound';
  const marker = prediction?.marker;
  const description = marker ? `Estimated route position toward ${inbound ? 'campus' : 'Fehren'}. This is a model estimate, not GPS.` : 'Route between campus and Fehren. No position estimate is available.';
  return <View style={s.card}>
    <View style={s.row}><Text style={s.eyebrow}>THE ROUTE</Text><Text style={s.caption}>Schematic · not to scale</Text></View>
    <View accessible accessibilityLabel={description} style={s.diagram}>
      <Svg width="100%" height={108} viewBox="0 0 320 108" accessible={false}>
        <Line x1={20} y1={62} x2={300} y2={62} stroke={colors.line} strokeWidth={4}/>
        {marker && <>
          <Rect x={20 + marker.lower * 280} y={46} width={(marker.upper - marker.lower) * 280} height={32} rx={8} fill={colors.amberTint} stroke={colors.amber} strokeDasharray="4 4"/>
          <Line x1={20 + marker.progress * 280} y1={35} x2={20 + marker.progress * 280} y2={62} stroke={colors.amber} strokeDasharray="3 3"/>
          <Rect x={6 + marker.progress * 280} y={7} width={28} height={27} rx={6} fill={colors.amber} />
          <Path d={`M${13 + marker.progress * 280} 15h14v10h-14z m3 12v-2m8 2v-2`} stroke={colors.card} strokeWidth={1.5} fill="none"/>
        </>}
        <Circle cx={20} cy={62} r={7} stroke={colors.ink} strokeWidth={2} fill={colors.card}/>
        <Circle cx={300} cy={62} r={7} stroke={colors.ink} strokeWidth={2} fill={colors.card}/>
      </Svg>
    </View>
    <View style={s.row}><Text style={s.stop}>{inbound ? 'Fehren' : 'Campus'}</Text><Text style={s.stop}>{inbound ? 'Campus' : 'Fehren'}</Text></View>
    <View style={s.rule}/>
    <Text style={s.body}>{marker ? 'Dashed zone = estimated position range' : 'Position estimate hidden'}</Text>
    <Text style={s.caption}>Not GPS. The camera does not confirm departure.</Text>
  </View>;
}
function ShuttleScreen({source, changeSource, settingsError}: {source: Source; changeSource: (source: Source) => void; settingsError: string}) {
  const {view, feed, now, refresh} = useShuttle(source);
  const [settings, setSettings] = useState(false);
  const [endpoint, setEndpoint] = useState(source.kind === 'api' ? source.endpoint : '');
  const [inputError, setInputError] = useState('');
  const sample = source.kind === 'sample' || feed?.status === 'sample';
  const observation = feed?.latest;
  const eventAge = observation?.eventAt ? Math.floor((now - Date.parse(observation.eventAt)) / 60_000) : null;
  const eventAgeLabel = eventAge === null ? 'Camera time unavailable' : eventAge < 0 ? 'Camera clock is ahead' : eventAge === 0 ? 'Less than a minute ago' : `${eventAge} min ago`;
  const estimated = view.kind === 'estimated';
  const status = view.kind === 'loading' ? 'Checking feed' : view.kind === 'unavailable' ? 'Feed unavailable' : view.kind === 'stale' ? 'Feed is stale' : sample ? 'Illustrative data' : 'Mailbox connected';
  function connect() {
    try {
      const next = parseEndpoint(endpoint, __DEV__);
      changeSource({kind: 'api', endpoint: next});
      setInputError(''); setSettings(false);
    } catch (error) {setInputError(error instanceof Error ? error.message : 'Check the status URL.');}
  }
  return <SafeAreaView style={s.page} edges={['top', 'left', 'right']}>
    <View style={s.header}>
      <View style={s.brand}><View style={s.brandIcon}><Icon kind="bus" color={colors.card}/></View><View><Text style={s.wordmark}>BusTrackr</Text><Text style={s.caption}>Fehren ↔ Skyway</Text></View></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Connection settings" onPress={() => setSettings(true)} style={s.iconButton}><Icon kind="settings"/></Pressable>
    </View>
    {sample && <View style={s.sampleBanner}><Text style={s.sampleBannerText}>SAMPLE DATA · NOT A REAL SHUTTLE</Text><Pressable accessibilityRole="button" onPress={() => setSettings(true)} style={s.bannerButton}><Text style={s.sampleLink}>Connect feed ↗</Text></Pressable></View>}
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.teal}/> }>
      <View style={s.row}><View style={s.statusRow}><View style={[s.statusDot, {backgroundColor: estimated ? colors.teal : colors.amber}]}/><Text accessibilityLiveRegion="polite" style={s.statusText}>{status}</Text></View><Pressable accessibilityRole="button" onPress={refresh} style={s.refreshButton}><Text style={s.refreshText}>Refresh ↻</Text></Pressable></View>
      {!!settingsError && <Text accessibilityRole="alert" style={s.error}>{settingsError}</Text>}
      <View style={[s.card, s.arrivalCard]}>
        <View style={s.row}><Text style={[s.eyebrow, s.amber]}>ARRIVAL ESTIMATE</Text>{sample && <Text style={s.sampleTag}>SAMPLE</Text>}</View>
        {view.kind === 'estimated' ? <>
          <Text style={s.destination}>To {view.prediction.direction === 'inbound' ? 'campus' : 'Fehren'}</Text>
          <Text accessibilityLabel={`Estimated arrival in ${view.rangeMinutes[0]} to ${view.rangeMinutes[1]} minutes`} style={s.range} maxFontSizeMultiplier={1.5}>{view.rangeMinutes[0]}–{view.rangeMinutes[1]} <Text style={s.minutes}>min</Text></Text>
          <Text style={s.body}>Approximate arrival range</Text>
          <View style={s.estimateRule}/>
          <Text style={s.body}>{view.prediction.anchor === 'camera' ? 'Based on a camera sighting and the timetable.' : 'Based on the timetable and recent delays.'}</Text>
          <Text style={s.caption}>Heuristic range, not calibrated. {view.prediction.historyCount} historical runs used.</Text>
          <Text style={s.caption}>Calculated {pacificTime(view.prediction.generatedAt)}</Text>
        </> : <>
          {view.kind === 'loading' && <ActivityIndicator color={colors.amber} style={s.loading}/>}
          <Text style={s.stateTitle}>{messages[view.kind].title}</Text>
          <Text style={s.body}>{messages[view.kind].body}</Text>
          {view.kind === 'scheduled' && view.nextCrossingAt && <Text style={s.scheduled}>Scheduled checkpoint crossing{ '\n'}{pacificTime(view.nextCrossingAt)}</Text>}
          {(view.kind === 'unavailable' || view.kind === 'stale') && <Button label="Try again" onPress={refresh} secondary/>}
        </>}
      </View>
      <View style={[s.card, s.observedCard]}>
        <View style={s.row}><View style={s.statusRow}><Icon kind="camera" color={colors.teal}/><Text style={[s.eyebrow, s.teal]}>LAST OBSERVATION</Text></View>{sample && <Text style={s.sampleTag}>SAMPLE</Text>}</View>
        <Text style={s.observedTitle}>{observation ? observation.checkpoint : feed ? 'No camera observations yet' : 'No observation available'}</Text>
        {observation && <>
          <Text style={s.observationTime}>{observation.eventAt ? pacificTime(observation.eventAt) : 'Camera time unavailable'}</Text>
          <Text style={[s.body, s.teal]}>{eventAgeLabel}</Text>
        </>}
        <Text style={s.caption}>{observation ? 'A vehicle was detected. This does not identify the shuttle, its direction, or whether it has left.' : 'A camera sighting will appear here when one is received. No arrival is implied by an empty feed.'}</Text>
        {observation && !observation.eventAt && <Text style={s.caption}>Email received {pacificTime(observation.receivedAt)}. Delivery time is not camera time.</Text>}
      </View>
      <Route view={view}/>
      <View style={s.footer}>
        <Text style={s.caption}>{feed?.lastCheckedAt ? `Mailbox checked ${pacificTime(feed.lastCheckedAt)}` : 'No successful mailbox check yet'}</Text>
        <Text style={s.caption}>{feed ? `${feed.eventCount} camera emails saved` : 'Observation history unavailable'} · Times shown in Pacific time</Text>
      </View>
      {source.kind === 'sample' && <View style={s.card}>
        <Text style={s.eyebrow}>EXPLORE SAMPLE STATES</Text>
        <Text style={s.caption}>Illustrative scenarios. No mailbox connection.</Text>
        <View style={s.choices}>{scenarios.map(scenario => <Pressable key={scenario.id} accessibilityRole="button" accessibilityState={{selected: source.scenario === scenario.id}} onPress={() => changeSource({kind: 'sample', scenario: scenario.id})} style={[s.choice, source.scenario === scenario.id && s.choiceSelected]}><Text style={[s.choiceText, source.scenario === scenario.id && s.choiceTextSelected]}>{scenario.label}</Text></Pressable>)}</View>
      </View>}
    </ScrollView>
    <Modal visible={settings} animationType="slide" onRequestClose={() => setSettings(false)}>
      <SafeAreaView style={s.page}>
        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.header}><Text style={s.wordmark}>Connection</Text><Button label="Done" onPress={() => setSettings(false)} secondary/></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
            <Text style={s.sheetTitle}>Your shuttle feed.</Text>
            <Text style={s.body}>Connect the status service supplied by your shuttle operator. No mailbox login belongs in this app.</Text>
            <Text style={s.inputLabel}>Status API URL</Text>
            <TextInput accessibilityLabel="Status API URL" value={endpoint} onChangeText={setEndpoint} placeholder="https://feed.example.org/api/shuttle" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url" textContentType="URL" returnKeyType="go" onSubmitEditing={connect} style={s.input}/>
            <Text style={s.caption}>Use HTTPS. On a physical phone, localhost means the phone itself.</Text>
            {__DEV__ && <Text style={s.caption}>Development builds also accept a local network HTTP address.</Text>}
            {!!inputError && <Text accessibilityRole="alert" style={s.error}>{inputError}</Text>}
            <Button label="Connect to feed" onPress={connect}/>
            <Button label="Use sample data" secondary onPress={() => {changeSource(defaultSource); setSettings(false); setInputError('');}}/>
            <View style={s.rule}/>
            <Text style={s.eyebrow}>ABOUT THE DATA</Text>
            <Text style={s.body}>Camera sightings are observations at one checkpoint. Arrival ranges and the dashed route marker are model estimates, not GPS.</Text>
            <Text style={s.body}>An unconfirmed timetable, ambiguous run, stale update or unavailable feed hides all estimates. No camera sighting proves a subsequent departure.</Text>
            <Text style={s.caption}>Only the status URL and sample selection are stored on this device. No location permission is needed.</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}
export default function Home() {
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    loadSource().then(value => {if (!disposed) setSource(value);}).catch(() => {
      if (!disposed) {setSource(defaultSource); setError('Could not restore connection settings. Showing sample data.');}
    });
    return () => {disposed = true;};
  }, []);
  function changeSource(next: Source) {
    setSource(next); setError('');
    void saveSource(next).catch(() => setError('This selection works now, but could not be saved on this device.'));
  }
  if (!source) return <SafeAreaView style={[s.page, s.startup]}><ActivityIndicator color={colors.teal}/><Text style={s.body}>Opening BusTrackr…</Text></SafeAreaView>;
  return <ShuttleScreen source={source} changeSource={changeSource} settingsError={error}/>;
}
