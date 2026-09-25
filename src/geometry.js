export function boundsFor(center, meters) {
 const dy = meters / 111320 / 2, dx = dy / Math.cos(center.lat * Math.PI / 180);
 return {south:center.lat-dy,north:center.lat+dy,west:center.lng-dx,east:center.lng+dx};
}
export function heightMeters(tags, fallback) {
 const raw=String(tags.height??'').replace(',','.');
 const h=parseFloat(raw); if(Number.isFinite(h)&&h>0) return Math.min(500,/ft|feet|'/.test(raw)?h*.3048:h);
 const levels=parseFloat(tags['building:levels']);return Number.isFinite(levels)&&levels>0?Math.min(500,levels*3):fallback;
}
export function binarySTL(vertices,indices){
 const count=indices.length/3,buffer=new ArrayBuffer(84+count*50),view=new DataView(buffer);
 new Uint8Array(buffer,0,80).set(new TextEncoder().encode('KONTUR | millimeters | map data (c) OpenStreetMap contributors ODbL'));
 view.setUint32(80,count,true);
 for(let i=0;i<count;i++){
 let offset=84+i*50;const a=indices[i*3]*3,b=indices[i*3+1]*3,c=indices[i*3+2]*3;
 const ux=vertices[b]-vertices[a],uy=vertices[b+1]-vertices[a+1],uz=vertices[b+2]-vertices[a+2],vx=vertices[c]-vertices[a],vy=vertices[c+1]-vertices[a+1],vz=vertices[c+2]-vertices[a+2];
 let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const len=Math.hypot(nx,ny,nz)||1;
 for(const v of [nx/len,ny/len,nz/len,...vertices.subarray(a,a+3),...vertices.subarray(b,b+3),...vertices.subarray(c,c+3)]){view.setFloat32(offset,v,true);offset+=4;}
 }
 return buffer;
}

export function modelPointFromGeo(lng,lat,bounds,size,margin=0){
 const inner=size-2*margin;
 return [(lng-bounds.west)/(bounds.east-bounds.west)*inner-inner/2,(lat-bounds.south)/(bounds.north-bounds.south)*inner-inner/2];
}
export function geoFromModelPoint(x,y,bounds,size,margin=0){
 const inner=size-2*margin;
 if(!Number.isFinite(x)||!Number.isFinite(y)||inner<=0||Math.abs(x)>inner/2||Math.abs(y)>inner/2)return null;
 return {lng:bounds.west+(x+inner/2)/inner*(bounds.east-bounds.west),lat:bounds.south+(y+inner/2)/inner*(bounds.north-bounds.south)};
}
