import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scanMailbox} from './mailbox.mjs';
const source=await readFile(new URL('./fixtures/avigilon-alert.eml',import.meta.url));
const config={sender:'avigilonalerts@vcs.net',marker:'BEI Bus has arrived.',checkpoint:'BEI campus corner',host:'imap.example.invalid',user:'test',cooldownSeconds:30};
test('mailbox backfill → camera parser → durable history; incremental restart avoids duplicate fetches',async()=>{
 const state={cursor:null,latest:null,events:[]};let persisted,releases=0,searches=0;
 const client={mailbox:{uidValidity:1n,uidNext:3},
  getMailboxLock:async(path,options)=>{assert.equal(path,'INBOX');assert.equal(options.readOnly,true);return{release(){releases++;}};},
  search:async query=>{searches++;assert.equal(query.from,config.sender);if(query.since)return[2,1];assert.equal(query.uid,'3:3');return[3];},
  fetchOne:async(uid,query)=>query.size?{size:source.length}:{source:uid==='3'?Buffer.from(source.toString().replace('sample-20261016','second-20261016').replace('02:06:43','02:07:43')):source,internalDate:new Date('2026-10-16T21:08:00Z')},
 };
 await scanMailbox(client,state,config,async()=>{persisted=JSON.parse(JSON.stringify(state));});
 assert.equal(persisted.events.length,1);assert.equal(persisted.events[0].eventAt,'2026-10-16T21:06:43.000Z');assert.equal(persisted.cursor.uid,2);
 await scanMailbox(client,JSON.parse(JSON.stringify(persisted)),config,async()=>{});
 assert.equal(searches,1);assert.equal(releases,2);
 client.mailbox.uidNext=4;
 await scanMailbox(client,state,config,async()=>{persisted=JSON.parse(JSON.stringify(state));});
 assert.equal(persisted.events.length,2);assert.equal(persisted.cursor.uid,3);assert.equal(releases,3);
});
test('zero backfill begins at latest UID and failed persistence releases lock',async()=>{
 const state={events:[]};let released=false;
 const client={mailbox:{uidValidity:1n,uidNext:20},getMailboxLock:async()=>({release(){released=true;}}),search(){throw new Error('must not fetch history');}};
 await assert.rejects(scanMailbox(client,state,config,async()=>{throw new Error('disk full');},0),/disk full/);
 assert.equal(released,true);assert.equal(state.cursor.uid,19);
});
