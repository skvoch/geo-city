import {test} from 'node:test';
import assert from 'node:assert/strict';
import {binarySTL,heightMeters,boundsFor} from './src/geometry.js';
test('height tags and geographic extents',()=>{assert.equal(heightMeters({height:'10,5'},15),10.5);assert.equal(heightMeters({'building:levels':'7'},15),21);assert.equal(heightMeters({},15),15);assert.equal(heightMeters({height:'100 ft'},15),30.48);const b=boundsFor({lat:55.75,lng:37.62},800);assert.ok(b.south<55.75&&b.north>55.75&&b.east>37.62&&b.west<37.62);});
import Module from 'manifold-3d';
import {buildVectorModel} from './src/vector-model.js';
const kernel=await Module();kernel.setup();
const center={lat:55.75,lng:37.62},area=800,size=200,bounds=boundsFor(center,area);
const ll=([x,y])=>[bounds.west+(x+100)/200*(bounds.east-bounds.west),bounds.south+(y+100)/200*(bounds.north-bounds.south)];
const polygon=(rings,height=20)=>({type:'Feature',properties:{building:'yes',height},geometry:{type:'Polygon',coordinates:rings.map(r=>r.map(ll))}});
const options={size,base:3,center,area,height:1,fallback:15,roads:false,roadWidth:1.2,roadHeight:.6,frame:false,pin:null,pinSize:9,pinShape:'heart',segments:64};
function assertClosed(result){
 const stl=binarySTL(result.vertices,result.indices);assert.equal(stl.byteLength,84+result.indices.length/3*50);assert.equal(new DataView(stl).getUint32(80,true),result.indices.length/3);
 const points=new Map(),weld=[];
 for(let i=0;i<result.vertices.length;i+=3){const key=Array.from(result.vertices.slice(i,i+3)).map(v=>v.toFixed(5)).join(',');if(!points.has(key))points.set(key,points.size);weld.push(points.get(key));}
 const edges=new Map();
 for(let i=0;i<result.indices.length;i+=3){const triangle=Array.from(result.indices.slice(i,i+3),v=>weld[v]);for(let j=0;j<3;j++){const a=triangle[j],b=triangle[(j+1)%3];assert.notEqual(a,b);const key=[Math.min(a,b),Math.max(a,b)].join(',');const old=edges.get(key)||[0,0];old[0]++;old[1]+=a<b?1:-1;edges.set(key,old);}}
 for(const [key,[count,direction]] of edges){assert.equal(count,2,key);assert.equal(direction,0,key);}
}
test('vector extrusion preserves diagonal walls and open courtyards without raster steps',()=>{
 const rings=[[[-30,-20],[30,-10],[20,30],[-30,20],[-30,-20]],[[-10,-5],[-10,10],[10,10],[10,-5],[-10,-5]]];
 const result=buildVectorModel(kernel,{features:[polygon(rings)]},options);assertClosed(result);
 const areaOf=r=>Math.abs(r.reduce((sum,p,i)=>{const q=r[(i+1)%r.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2);
 assert.ok(Math.abs(result.volume-(120000+(areaOf(rings[0])-areaOf(rings[1]))*5))<.01);
 assert.ok(result.indices.length/3<100,'simple contours should not become thousands of grid triangles');
 for(let i=2;i<result.vertices.length;i+=3)assert.ok([0,3,8].some(z=>Math.abs(result.vertices[i]-z)<1e-5));
});
test('overlaps, clipped buildings, roads, frame and heart produce one closed solid',()=>{
 const features=[polygon([[[80,-15],[120,-15],[120,15],[80,15],[80,-15]]]),polygon([[[-10,-10],[15,-10],[15,15],[-10,15],[-10,-10]]]),{properties:{highway:'residential'},geometry:{type:'LineString',coordinates:[ll([-150,-35]),ll([0,0]),ll([140,90])]}}];
 const result=buildVectorModel(kernel,{features},{...options,roads:true,frame:true,pin:{lat:center.lat,lng:center.lng}});assertClosed(result);
 for(let i=0;i<result.vertices.length;i+=3){assert.ok(Math.abs(result.vertices[i])<=100.00001);assert.ok(Math.abs(result.vertices[i+1])<=100.00001);}
 assert.ok(result.colors.includes(2));assert.ok(result.volume>120000);
});
