import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {ImapFlow} from 'imapflow';
import {loadState, saveState, parseAlert, recordAlert} from './alerts.mjs';
import {scanMailbox, mailboxAuth} from './mailbox.mjs';
import {estimate, validateSchedule} from './estimator.mjs';

const sample = process.argv.includes('--sample');
const once = process.argv.includes('--once');
const required = sample ? [] : ['IMAP_HOST','IMAP_USER','CAMERA_SENDER','CAMERA_MARKER'];
for (const key of required) if (!process.env[key]?.trim()) throw new Error(`Set ${key} in .env.server`);
if (!sample && !process.env.IMAP_PASSWORD && !process.env.IMAP_ACCESS_TOKEN && !process.env.GOOGLE_REFRESH_TOKEN) throw new Error('Set an IMAP app password or OAuth credentials');
const config = {
  sender:sample?'avigilonalerts@vcs.net':process.env.CAMERA_SENDER,
  subject:sample?'':process.env.CAMERA_SUBJECT || '',
  marker:sample?'BEI Bus has arrived.':process.env.CAMERA_MARKER,
  checkpoint:sample?'BEI campus corner':process.env.CAMERA_CHECKPOINT || 'BEI campus corner',
  host:process.env.IMAP_HOST, user:process.env.IMAP_USER, mailbox:process.env.IMAP_MAILBOX || 'INBOX',
  cooldownSeconds:Number(process.env.CAMERA_COOLDOWN_SECONDS || 30),
};
const statePath = process.env.ALERT_STATE_FILE || (sample ? '.data/sample-alerts.json' : '.data/alerts.json');
const state = await loadState(statePath);
let schedule = validateSchedule(JSON.parse(await readFile(process.env.ALERT_SCHEDULE_FILE || new URL('./schedule.json', import.meta.url), 'utf8')));
let status = sample ? 'sample' : 'connecting';
let lastCheckedAt = null;
const port = Number(process.env.ALERT_PORT || 8787);
const interval = Number(process.env.IMAP_POLL_SECONDS || 30);
const imapPort = Number(process.env.IMAP_PORT || 993);
const backfillDays = Number(process.env.IMAP_BACKFILL_DAYS || 7);
if (![port, imapPort].every(n=>Number.isInteger(n) && n > 0 && n <= 65535) || !Number.isFinite(interval) || interval < 5 || !Number.isInteger(backfillDays) || backfillDays<0 || backfillDays>365 || !Number.isFinite(config.cooldownSeconds) || config.cooldownSeconds<0 || config.cooldownSeconds>300) throw new Error('Invalid port, polling, backfill, or cooldown setting');
if (sample) {
  if (!state.events.length) {
    const seen = new Date(Date.now()-120_000);
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true,timeZoneName:'short'}).formatToParts(seen).map(p=>[p.type,p.value]));
    const stamp=`[${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.dayPeriod} (${p.timeZoneName})]`;
    const fixture = (await readFile(new URL('./fixtures/avigilon-alert.eml', import.meta.url),'utf8')).replace(/\[2026-Oct-16[^\]]+\]/,stamp);
    recordAlert(state,await parseAlert(fixture,config));
    await saveState(statePath,state);
  }
  const event=state.events.find(e=>!e.duplicateOf && e.eventAt);
  if (!event) throw new Error('Remove or migrate legacy sample state to run the new sample');
  const time=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(event.eventAt));
  schedule=validateSchedule({version:'SAMPLE-ONLY',confirmed:true,runs:[{id:'sample-run',days:[0,1,2,3,4,5,6],time,checkpoint:config.checkpoint,checkpointProgress:.05,direction:'outbound',durationSeconds:480}]});
  lastCheckedAt = new Date().toISOString();
}
function payload() {
  const checkAge=lastCheckedAt ? Date.now()-Date.parse(lastCheckedAt) : Infinity;
  const feedStatus=sample?'sample':status==='connected' && checkAge>(interval+90)*1000?'disconnected':status;
  const prediction=estimate(schedule,state.events);
  if (!sample && feedStatus!=='connected') {prediction.marker=null;prediction.status='offline';prediction.reason='Mailbox feed is not current; position estimate hidden.';}
  return {status:feedStatus,lastCheckedAt,latest:state.latest,eventCount:state.events.length,prediction};
}
const server = createServer((req,res)=>{
  const origin=process.env.ALERT_ALLOWED_ORIGIN;
  if (origin && req.headers.origin===origin) res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin'); res.setHeader('Cache-Control','no-store'); res.setHeader('Content-Type','application/json');
  if (req.method!=='GET' || !['/api/detections/latest','/api/shuttle'].includes(req.url)) {res.writeHead(404);res.end(JSON.stringify({error:'Not found'}));return;}
  res.end(JSON.stringify(payload()));
});
if (!once) server.listen(port,process.env.ALERT_HOST || '127.0.0.1',()=>console.log(`Detection API on port ${port} (${sample?'sample':'IMAP'})`));
let activeClient;
let stopping=false;
const abort=new AbortController();
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{stopping=true;abort.abort();activeClient?.close();server.close();});
if (!sample) {
  while (!stopping) {
    let client;
    try {
      client = new ImapFlow({host:config.host,port:imapPort,secure:true,auth:await mailboxAuth(process.env),logger:false,connectionTimeout:20_000,greetingTimeout:20_000,socketTimeout:60_000});
      activeClient=client;
      client.on('error',()=>{status='disconnected';client.close();});
      await client.connect();
      await scanMailbox(client,state,config,()=>saveState(statePath,state),backfillDays);
      lastCheckedAt=new Date().toISOString();status='connected';
      await client.logout();
      console.log(`Mailbox checked: ${state.events.length} camera events stored.`);
    } catch {status='disconnected';console.error('Mailbox check failed; check credentials, mailbox, and connectivity.');if(once)process.exitCode=1;}
    finally {client?.close();activeClient=null;}
    if (once || stopping) break;
    try {await delay(interval*1000,undefined,{signal:abort.signal});} catch {break;}
  }
}
