import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOverpass} from './src/overpass.js';

test('uses the next map source when the first keeps waiting',async()=>{
 const called=[];
 const fetcher=(url,{signal})=>{
  called.push(url);
  if(url==='slow')return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  return Promise.resolve({ok:true,json:async()=>({elements:[{type:'way',id:1}]})});
 };
 const data=await loadOverpass('query',['slow','ready'],{fetcher,staggerMs:5,timeoutMs:1000});
 assert.equal(data.elements[0].id,1);
 assert.deepEqual(called,['slow','ready']);
});

test('cancelling model creation stops every map request',async()=>{
 const controller=new AbortController();
 const fetcher=(_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 const pending=loadOverpass('query',['slow','later'],{signal:controller.signal,fetcher,staggerMs:1000});
 controller.abort();
 await assert.rejects(pending);
});

test('uses the direct map API as a final read-only fallback',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,method:options.method});
  if(options.method==='POST')return {ok:false,status:503};
  return {ok:true,json:async()=>({elements:[{type:'way',id:2}]})};
 };
 const data=await loadOverpass('query',['busy',{url:'https://api.openstreetmap.org/api/0.6/map.json?bbox=1,2,3,4'}],{fetcher,staggerMs:1});
 assert.equal(data.elements[0].id,2);
 assert.deepEqual(calls.map(({method})=>method),['POST','GET']);
});
