const zone = 'America/Los_Angeles';
const formatter = new Intl.DateTimeFormat('en-CA', {timeZone:zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
function parts(date) { return Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value])); }
export function serviceDate(date) { const p = parts(date); return `${p.year}-${p.month}-${p.day}`; }
export function scheduledTime(day, time) {
  // Test both Pacific offsets, then round-trip: nonexistent/ambiguous DST times are rejected.
  const candidates = [7,8].map(offset=>new Date(Date.parse(`${day}T${time}:00Z`)+offset*3600_000)).filter(date=>{
    const p = parts(date); return serviceDate(date) === day && `${p.hour}:${p.minute}` === time;
  });
  return candidates.length === 1 ? candidates[0].getTime() : null;
}
export function validateSchedule(schedule) {
  if (!schedule || typeof schedule.confirmed !== 'boolean' || typeof schedule.version !== 'string' || !Array.isArray(schedule.runs)) throw new Error('Invalid schedule header');
  const ids = new Set();
  for (const run of schedule.runs) {
    if (!run.id || ids.has(run.id) || !Array.isArray(run.days) || !run.days.length || run.days.some(d=>!Number.isInteger(d)||d<0||d>6) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(run.time) || !run.checkpoint || !['inbound','outbound'].includes(run.direction) || !Number.isFinite(run.durationSeconds) || run.durationSeconds<=0 || run.durationSeconds>7200 || !Number.isFinite(run.checkpointProgress) || run.checkpointProgress<0 || run.checkpointProgress>1) throw new Error('Invalid scheduled run');
    ids.add(run.id);
  }
  if (schedule.matchWindowSeconds !== undefined && (!Number.isFinite(schedule.matchWindowSeconds) || schedule.matchWindowSeconds<=0 || schedule.matchWindowSeconds>3600)) throw new Error('Invalid match window');
  if (schedule.excludedDates !== undefined && (!Array.isArray(schedule.excludedDates) || schedule.excludedDates.some(d=>typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)))) throw new Error('Invalid excluded dates');
  return schedule;
}
function runsOn(schedule, day) {
  if ((schedule.excludedDates || []).includes(day)) return [];
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return schedule.runs.filter(run=>run.days.includes(weekday)).map(run=>({...run, day, crossing:scheduledTime(day,run.time)})).filter(run=>run.crossing !== null);
}
export function matchEvent(event, schedule) {
  if (!event.eventAt || event.duplicateOf) return [];
  const time = Date.parse(event.eventAt);
  return runsOn(schedule,serviceDate(new Date(time))).filter(run=>run.checkpoint === event.checkpoint && Math.abs(time-run.crossing) <= (schedule.matchWindowSeconds || 900)*1000);
}
function median(values) { const sorted = [...values].sort((a,b)=>a-b); const i=Math.floor(sorted.length/2); return sorted.length ? (sorted[i]+sorted[Math.floor((sorted.length-1)/2)])/2 : 0; }
export function estimate(schedule, events, now = new Date()) {
  const base = {model:'schedule-median-v1', scheduleVersion:schedule.version, generatedAt:now.toISOString(), timeZone:zone};
  if (!schedule.confirmed || !schedule.runs.length) return {...base, status:'unconfigured', marker:null, reason:'Waiting for a confirmed timetable and checkpoint direction.'};
  const time = now.getTime();
  const eligible = events.filter(e=>e.eventAt && !e.duplicateOf && Date.parse(e.eventAt)<=time && Date.parse(e.receivedAt)<=time);
  const matches = eligible.map(event=>({event, runs:matchEvent(event,schedule)}));
  const day = serviceDate(now);
  const candidates = runsOn(schedule,day).map(run=>{
    const history = matches.filter(m=>m.runs.some(r=>r.id===run.id && r.day<day));
    // One arrival per run/date; multiple separate sightings are ambiguous, not extra training rows.
    const unique = history.filter(m=>m.runs.length===1 && history.filter(other=>other.runs.some(r=>r.id===run.id && r.day===m.runs[0].day)).length===1).sort((a,b)=>Date.parse(a.event.eventAt)-Date.parse(b.event.eventAt)).slice(-20);
    const delays = unique.map(m=>(Date.parse(m.event.eventAt)-m.runs[0].crossing)/1000);
    const delaySeconds = median(delays);
    const todays = matches.filter(m=>m.runs.some(r=>r.id===run.id&&r.day===day));
    const ambiguous = todays.length>1 || todays.some(m=>m.runs.length!==1);
    const observation = !ambiguous && todays.length===1 ? todays[0].event : null;
    const crossing = observation ? Date.parse(observation.eventAt) : run.crossing+delaySeconds*1000;
    const start = crossing-run.checkpointProgress*run.durationSeconds*1000;
    const end = start+run.durationSeconds*1000;
    return {run, crossing, start, end, observation, ambiguous, historyCount:unique.length, delaySeconds};
  });
  const active = candidates.filter(c=>time>=c.start && time<=c.end);
  if (active.length>1 || active.some(c=>c.ambiguous)) return {...base,status:'ambiguous',marker:null,reason:'More than one run or arrival could match. No vehicle position assigned.'};
  if (!active.length) {
    const next = candidates.filter(c=>c.start>time).sort((a,b)=>a.start-b.start)[0];
    return {...base,status:next?'scheduled':'unknown',marker:null,nextCrossingAt:next?new Date(next.crossing).toISOString():null,reason:next?'Waiting for the next scheduled run.':'No active scheduled run; arrival is not confirmed.'};
  }
  const c=active[0];
  const progress = Math.min(1,Math.max(0,(time-c.start)/(c.end-c.start)));
  const remainingSeconds = Math.max(0,(c.end-time)/1000);
  // shortcut: constant speed and a heuristic range, replace with measured segment profiles and calibrated errors.
  const uncertaintySeconds = 120 + (c.observation ? Math.abs(time-Date.parse(c.observation.eventAt))/1000*.2 : 120);
  return {...base,status:'estimated',runId:c.run.id,serviceDate:day,direction:c.run.direction,checkpoint:c.run.checkpoint,
    anchor:c.observation?'camera':'schedule',eventId:c.observation?.id || null,historyCount:c.historyCount,delaySeconds:c.delaySeconds,
    estimatedArrivalAt:new Date(c.end).toISOString(),remainingSeconds,
    rangeSeconds:[Math.max(0,remainingSeconds-uncertaintySeconds),remainingSeconds+uncertaintySeconds],rangeKind:'heuristic-not-calibrated',
    marker:{direction:c.run.direction,progress,lower:Math.max(0,progress-uncertaintySeconds/c.run.durationSeconds),upper:Math.min(1,progress+uncertaintySeconds/c.run.durationSeconds)}};
}
