import {boundsFor,heightMeters,modelPointFromGeo} from './geometry.js';

// Exact 2D contours are clipped before extrusion. Boolean union removes all
// interior faces, so preview and STL use the same closed printable surface.
export function buildVectorModel(kernel, geo, options) {
 const {CrossSection,Manifold}=kernel;
 const owned=[];const keep=x=>(owned.push(x),x);
 const {size,base,center,area,height,fallback,roads,roadWidth,roadHeight,frame,pin,pinSize,pinShape,margin=0,segments=64}=options;
 const bounds=boundsFor(center,area),half=size/2,innerHalf=half-margin;
 const project=([lng,lat])=>modelPointFromGeo(lng,lat,bounds,size,margin);
 const solids=[],buildingSections=[];
 try {
  const baseClip=keep(CrossSection.square([size,size],true));
  const clip=margin?keep(CrossSection.square([size-2*margin,size-2*margin],true)):baseClip;
  const addSolid=(section,z,color=0)=>{
   if(section.isEmpty())return;
   const extrusion=keep(section.extrude(z));
   solids.push(keep(extrusion.setProperties(1,p=>{p[0]=color;})));
  };
  addSolid(baseClip,base);
  const buildings=geo.features.filter(f=>f.properties?.building&&['Polygon','MultiPolygon'].includes(f.geometry?.type));
  const roadFeatures=geo.features.filter(f=>f.properties?.highway&&['LineString','MultiLineString'].includes(f.geometry?.type));
  if(roads){
   const paths=[];const r=roadWidth/2;
   // Segment rectangles and round joins form continuous vector strokes.
   for(const f of roadFeatures)for(const line of f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates){
    const points=line.map(project);
    for(let i=1;i<points.length;i++){
     const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<1e-7)continue;
     if(Math.min(a[0],b[0])>innerHalf+r||Math.max(a[0],b[0])<-innerHalf-r||Math.min(a[1],b[1])>innerHalf+r||Math.max(a[1],b[1])<-innerHalf-r)continue;
     const nx=-dy/length*r,ny=dx/length*r;
     paths.push([[a[0]-nx,a[1]-ny],[b[0]-nx,b[1]-ny],[b[0]+nx,b[1]+ny],[a[0]+nx,a[1]+ny]]);
    }
    for(const p of points)if(Math.abs(p[0])<=innerHalf+r&&Math.abs(p[1])<=innerHalf+r)paths.push(Array.from({length:Math.max(12,segments/4)},(_,i,arr)=>{const angle=i/(Math.max(12,segments/4))*Math.PI*2;return [p[0]+r*Math.cos(angle),p[1]+r*Math.sin(angle)];}));
   }
   if(paths.length){const stroke=keep(new CrossSection(paths,'NonZero'));addSolid(keep(stroke.intersect(clip)),base+roadHeight,1);}
  }
  for(const feature of buildings){
   const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
   for(const polygon of polygons){
    const rings=polygon.map(ring=>ring.map(project)).filter(ring=>ring.length>=3);
    if(!rings.length)continue;
    const section=keep(new CrossSection(rings,'EvenOdd'));
    const clipped=keep(section.intersect(clip));
    const z=base+Math.max(.5,heightMeters(feature.properties,fallback)*size/area*height);
    addSolid(clipped,z);buildingSections.push({section:clipped,z});
   }
  }
  if(frame){const inner=keep(CrossSection.square([size-4,size-4],true));addSolid(keep(baseClip.subtract(inner)),base+2);}
  if(pin){
   const [x,y]=project([pin.lng,pin.lat]);
   const points=Array.from({length:segments},(_,i)=>{
    const t=i/segments*Math.PI*2;
    if(pinShape==='circle')return [x+pinSize/2*Math.cos(t),y+pinSize/2*Math.sin(t)];
    // Analytic heart; normalize to the selected width in millimetres.
    return [x+pinSize/32*16*Math.sin(t)**3,y+pinSize/32*(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))];
   });
   const heart=keep(new CrossSection([points],'EvenOdd'));
   const clipped=keep(heart.intersect(clip));let peak=base+(frame?2:0)+(roads?roadHeight:0);
   for(const entry of buildingSections){const overlap=keep(entry.section.intersect(clipped));if(!overlap.isEmpty())peak=Math.max(peak,entry.z);}
   addSolid(clipped,peak+2,2);
  }
  const result=keep(Manifold.union(solids));
  if(result.status()!=='NoError')throw new Error(`Ошибка объединения: ${result.status()}`);
  const raw=result.getMesh(),count=raw.vertProperties.length/raw.numProp;
  const vertices=new Float32Array(count*3),colors=new Uint8Array(count);
  for(let i=0;i<count;i++){vertices.set(raw.vertProperties.subarray(i*raw.numProp,i*raw.numProp+3),i*3);colors[i]=Math.round(raw.vertProperties[i*raw.numProp+3]);}
  return {vertices,indices:new Uint32Array(raw.triVerts),colors,buildingCount:buildings.length,roadCount:roadFeatures.length,volume:result.volume()};
 } finally {for(let i=owned.length-1;i>=0;i--)owned[i].delete();}
}
