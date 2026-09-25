const ranges={area:[300,1800],size:[100,250],base:[2,8],margin:[0,20],height:[.5,4],fallback:[3,50],roadWidth:[.6,4],roadHeight:[.2,3],pinSize:[4,20],quality:[32,128]};
const finite=(value,[min,max])=>{const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null;};
export function encodeShareState(state){
 const p=new URLSearchParams({v:'1',lat:state.center.lat.toFixed(6),lng:state.center.lng.toFixed(6),area:String(state.area),name:String(state.name||'').slice(0,80)});
 for(const key of Object.keys(ranges))p.set(key,String(state[key]));
 for(const key of ['frame','roads'])p.set(key,state[key]?'1':'0');
 if(state.pin){p.set('pinLat',state.pin.lat.toFixed(6));p.set('pinLng',state.pin.lng.toFixed(6));}
 p.set('pinShape',state.pinShape==='circle'?'circle':'heart');
 return p.toString();
}
export function decodeShareState(hash){
 const p=new URLSearchParams(hash.replace(/^#/,''));if(!['1','2'].includes(p.get('v')))return null;
 const lat=finite(p.get('lat'),[-85,85]),lng=finite(p.get('lng'),[-180,180]);if(lat===null||lng===null)return null;
 const state={center:{lat,lng},name:(p.get('name')||'Выбранный участок').slice(0,80)};
 for(const [key,range] of Object.entries(ranges)){const n=finite(p.get(key),range);if(n===null)return null;state[key]=n;}
 state.frame=p.get('frame')==='1';state.roads=p.get('roads')==='1';state.pinShape=p.get('pinShape')==='circle'?'circle':'heart';
 const pinLat=p.has('pinLat')?finite(p.get('pinLat'),[-85,85]):null,pinLng=p.has('pinLng')?finite(p.get('pinLng'),[-180,180]):null;
 state.pin=pinLat!==null&&pinLng!==null?{lat:pinLat,lng:pinLng}:null;
 return state;
}

const printable=f=>f?.geometry&&(
 (f.properties?.building&&['Polygon','MultiPolygon'].includes(f.geometry.type))||
 (f.properties?.highway&&['LineString','MultiLineString'].includes(f.geometry.type))
);
export function compactModelGeo(geo){
 return {type:'FeatureCollection',features:geo.features.filter(printable).map(f=>({type:'Feature',geometry:f.geometry,properties:{
  ...(f.properties.building?{building:f.properties.building}:{}),
  ...(f.properties.height?{height:f.properties.height}:{}),
  ...(f.properties['building:levels']?{'building:levels':f.properties['building:levels']}:{}),
  ...(f.properties.highway?{highway:f.properties.highway}:{})
 }}))};
}
const toBase64Url=bytes=>{
 let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const fromBase64Url=value=>{
 const binary=atob(value.replace(/-/g,'+').replace(/_/g,'/'));const bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return bytes;
};
export async function encodeSelfContainedShare(state,geo){
 const data=new TextEncoder().encode(JSON.stringify(compactModelGeo(geo)));
 const zipped=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 const params=new URLSearchParams(encodeShareState(state));params.set('v','2');params.set('model',toBase64Url(zipped));
 return params.toString();
}
export async function decodeEmbeddedGeo(hash){
 const params=new URLSearchParams(hash.replace(/^#/,''));if(params.get('v')!=='2')return null;
 const encoded=params.get('model');if(!encoded||encoded.length>2_000_000)throw new Error('Данные модели в ссылке повреждены или слишком велики');
 const zipped=fromBase64Url(encoded);
 const json=await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
 if(json.length>20_000_000)throw new Error('Данные модели слишком велики');
 const geo=JSON.parse(json);
 if(geo?.type!=='FeatureCollection'||!Array.isArray(geo.features)||geo.features.length>100_000||geo.features.some(f=>!printable(f)))throw new Error('Некорректные данные модели');
 return geo;
}

