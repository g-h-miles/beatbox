import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkReference,AUDIO_SHA256} from './check-blind-reference.mjs';
const reference=()=>({version:1,recordingId:'recording-001',audioSha256:AUDIO_SHA256,durationSeconds:8.3,reviewer:'Reviewer A',complete:true,notes:'',events:[{time:.123456789,drum:'kick',transcript:'',ambiguous:false}]});
test('keeps exact unquantized reference times',()=>{const r=reference();assert.equal(checkReference(r).events,1);assert.equal(r.events[0].time,.123456789);});
test('rejects another recording even with matching event fields',()=>{const r=reference();r.audioSha256='0'.repeat(64);assert.throws(()=>checkReference(r),/audio identity/);});
test('rejects boundary, nonfinite and duplicate onset times',()=>{for(const t of [-.01,NaN,Infinity,8.3]){const r=reference();r.events[0].time=t;assert.throws(()=>checkReference(r),/time outside/);}const r=reference();r.events.push({...r.events[0]});assert.throws(()=>checkReference(r),/strictly increasing/);});
test('does not promote drafts or anonymous completion',()=>{const r=reference();r.complete=false;assert.equal(checkReference(r).complete,false);assert.throws(()=>checkReference(r,{requireComplete:true}),/draft/);r.complete=true;r.reviewer=' ';assert.throws(()=>checkReference(r),/attribution/);});
test('retains uncertainty rather than treating it as correct or dropping it',()=>{const r=reference();r.events[0].drum='unknown';const s=checkReference(r);assert.equal(s.uncertainEvents,1);assert.equal(s.events,1);assert.equal(s.limitations.length,1);assert.match(s.independentVerification,/Not established/);});
test('rejects empty classification instead of assigning a default',()=>{const r=reference();r.events[0].drum='';assert.throws(()=>checkReference(r),/unfinished/);});

test('keeps unfinished draft labels blank',()=>{const r=reference();r.complete=false;r.events[0].drum='';const s=checkReference(r);assert.equal(s.unfinishedEvents,1);assert.equal(r.events[0].drum,'');});

test('rejects a truncated duration for the known recording',()=>{const r=reference();r.durationSeconds=1;assert.throws(()=>checkReference(r),/decoded duration/);});
