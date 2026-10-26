import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estimate,matchEvent,scheduledTime,validateSchedule} from './estimator.mjs';
import {cameraTimestamp,parseAlert} from './alerts.mjs';
const run={id:'afternoon',days:[1,2,3,4,5],time:'14:00',checkpoint:'BEI campus corner',checkpointProgress:0,direction:'outbound',durationSeconds:600};
const schedule={version:'test',confirmed:true,runs:[run]};
const event=(id,eventAt,extra={})=>({id,checkpoint:run.checkpoint,eventAt,receivedAt:eventAt,...extra});
test('Pacific calendar conversion and camera timestamp validation',()=>{
 assert.equal(new Date(scheduledTime('2026-10-16','14:00')).toISOString(),'2026-10-16T21:00:00.000Z');
 assert.equal(new Date(scheduledTime('2026-12-16','14:00')).toISOString(),'2026-12-16T22:00:00.000Z');
 assert.equal(scheduledTime('2026-03-08','02:30'),null);
 assert.equal(scheduledTime('2026-11-01','01:30'),null);
 assert.equal(cameraTimestamp('[2026-Oct-16 02:06:43 PM (PDT)] BEI Bus has arrived.'),'2026-10-16T21:06:43.000Z');
 for(const text of ['[2026-Feb-30 02:06:43 PM (PST)] BEI Bus has arrived.','[2026-Oct-16 02:06:43 PM (PST)] BEI Bus has arrived.','[2026-Oct-16 00:06:43 PM (PDT)] BEI Bus has arrived.'])assert.equal(cameraTimestamp(text),null);
});
test('HTML-only camera messages work and malformed/future events do not',async()=>{
 const config={sender:'avigilonalerts@vcs.net',marker:'BEI Bus has arrived.',checkpoint:run.checkpoint};
 const raw='From: Avigilonalerts@vcs.net\r\nContent-Type: text/html\r\n\r\n<p>[2026-Oct-16 02:06:43 PM (PDT)] BEI Bus has arrived.</p>';
 assert.ok(await parseAlert(raw,config,new Date('2026-10-16T21:07:00Z')));
 assert.equal(await parseAlert(raw,config,new Date('2026-10-16T20:00:00Z')),null);
});
test('configuration gates, school holidays and weekends suppress marker',()=>{
 assert.equal(estimate({...schedule,confirmed:false},[]).status,'unconfigured');
 assert.equal(estimate({...schedule,excludedDates:['2026-10-16']},[],new Date('2026-10-16T21:05:00Z')).marker,null);
 assert.equal(estimate(schedule,[],new Date('2026-10-17T21:05:00Z')).marker,null);
 assert.throws(()=>validateSchedule({...schedule,runs:[{...run,durationSeconds:-1}]}));
});
test('rolling median learns checkpoint delay only from previous uniquely matched runs',()=>{
 const history=[event('a','2026-10-13T21:02:00Z'),event('b','2026-10-14T21:03:00Z'),event('c','2026-10-15T21:04:00Z')];
 const result=estimate(schedule,history,new Date('2026-10-16T21:05:00Z'));
 assert.equal(result.delaySeconds,180);assert.equal(result.historyCount,3);assert.equal(result.anchor,'schedule');assert.equal(result.marker.progress,.2);
 assert.equal(result.rangeKind,'heuristic-not-calibrated');
 const seen=event('today','2026-10-16T21:01:00Z');
 const anchored=estimate(schedule,[...history,seen],new Date('2026-10-16T21:05:00Z'));
 assert.equal(anchored.anchor,'camera');assert.equal(anchored.marker.progress,.4);assert.equal(anchored.remainingSeconds,360);
 const later=estimate(schedule,[...history,seen],new Date('2026-10-16T21:06:00Z'));
 assert.ok(later.marker.progress>anchored.marker.progress);
 assert.equal(estimate(schedule,[seen],new Date('2026-10-16T21:30:00Z')).marker,null);
});
test('duplicate alerts do not move anchor; ambiguous identity hides the marker',()=>{
 const a=event('a','2026-10-16T21:01:00Z');
 const duplicate=event('d','2026-10-16T21:01:20Z',{duplicateOf:'a'});
 assert.equal(estimate(schedule,[a,duplicate],new Date('2026-10-16T21:05:00Z')).eventId,'a');
 assert.equal(estimate(schedule,[a,event('b','2026-10-16T21:02:00Z')],new Date('2026-10-16T21:05:00Z')).status,'ambiguous');
 assert.equal(matchEvent(a,{...schedule,runs:[run,{...run,id:'other'}]}).length,2);
 assert.equal(estimate({...schedule,runs:[run,{...run,id:'other'}]},[a],new Date('2026-10-16T21:05:00Z')).marker,null);
});
test('future events and mail delivered later are unavailable to historical predictions',()=>{
 const now=new Date('2026-10-16T21:05:00Z');
 const result=estimate(schedule,[event('future','2026-10-16T21:06:00Z'),event('late','2026-10-16T21:01:00Z',{receivedAt:'2026-10-16T21:10:00Z'})],now);
 assert.equal(result.anchor,'schedule');assert.equal(result.marker.progress,.5);
});
test('an ambiguous historical sighting excludes the whole affected run date from training',()=>{
 const overlapping={...schedule,runs:[run,{...run,id:'later',time:'14:20'}]};
 const history=[event('unique','2026-10-15T20:50:00Z'),event('ambiguous','2026-10-15T21:10:00Z')];
 const result=estimate(overlapping,history,new Date('2026-10-16T21:05:00Z'));
 assert.equal(result.historyCount,0);assert.equal(result.delaySeconds,0);
});
