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
 const p=new URLSearchParams(hash.replace(/^#/,''));if(p.get('v')!=='1')return null;
 const lat=finite(p.get('lat'),[-85,85]),lng=finite(p.get('lng'),[-180,180]);if(lat===null||lng===null)return null;
 const state={center:{lat,lng},name:(p.get('name')||'Выбранный участок').slice(0,80)};
 for(const [key,range] of Object.entries(ranges)){const n=finite(p.get(key),range);if(n===null)return null;state[key]=n;}
 state.frame=p.get('frame')==='1';state.roads=p.get('roads')==='1';state.pinShape=p.get('pinShape')==='circle'?'circle':'heart';
 const pinLat=p.has('pinLat')?finite(p.get('pinLat'),[-85,85]):null,pinLng=p.has('pinLng')?finite(p.get('pinLng'),[-180,180]):null;
 state.pin=pinLat!==null&&pinLng!==null?{lat:pinLat,lng:pinLng}:null;
 return state;
}
