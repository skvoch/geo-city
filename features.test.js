import {test} from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {boundsFor,modelPointFromGeo,geoFromModelPoint} from './src/geometry.js';
import {buildVectorModel} from './src/vector-model.js';
import {encodeShareState,decodeShareState} from './src/share.js';
const kernel=await Module();kernel.setup();
const center={lat:57.174348,lng:65.541747},bounds=boundsFor(center,800);
test('editable margin keeps the printable base size and exact inset buildings',()=>{
 const ring=[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]].map(([x,y])=>[bounds.west+(x+1)/2*(bounds.east-bounds.west),bounds.south+(y+1)/2*(bounds.north-bounds.south)]);
 const geo={features:[{properties:{building:'yes',height:'12'},geometry:{type:'Polygon',coordinates:[ring]}}]};
 const model=buildVectorModel(kernel,geo,{size:200,base:3,center,area:800,height:1,fallback:15,roads:false,roadWidth:1,roadHeight:.6,frame:false,pin:null,pinSize:9,pinShape:'heart',margin:12});
 let raisedMax=0,baseMax=0;for(let i=0;i<model.vertices.length;i+=3){const [x,y,z]=model.vertices.slice(i,i+3);if(z>3.01)raisedMax=Math.max(raisedMax,Math.abs(x),Math.abs(y));else baseMax=Math.max(baseMax,Math.abs(x),Math.abs(y));}
 assert.ok(raisedMax<=88.0001);assert.ok(baseMax>=99.999);
});
test('3D click position maps back to geographic point inside the inset',()=>{
 const p=modelPointFromGeo(center.lng,center.lat,bounds,200,12),location=geoFromModelPoint(p[0],p[1],bounds,200,12);
 assert.ok(Math.abs(location.lat-center.lat)<1e-9);assert.ok(Math.abs(location.lng-center.lng)<1e-9);
 assert.equal(geoFromModelPoint(95,0,bounds,200,12),null);
});
test('shared links restore coordinates, pin, margin and settings',()=>{
 const state={center,area:800,name:'Тюмень · Щербакова, 88',size:200,base:3,margin:12,height:1.5,fallback:15,roadWidth:1.2,roadHeight:.6,pinSize:9,quality:64,frame:true,roads:true,pinShape:'heart',pin:center};
 const decoded=decodeShareState('#'+encodeShareState(state));
 assert.equal(decoded.margin,12);assert.equal(decoded.name,state.name);assert.deepEqual(decoded.center,center);assert.deepEqual(decoded.pin,center);assert.equal(decodeShareState('#v=1&lat=999'),null);
});
