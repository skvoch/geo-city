// Photon returns OSM-backed point features. Keep distinct mapped buildings even
// when they share a street address, and never treat a street as an exact house.
export function searchSuggestion(query){
 const words=query.trim().split(/\s+/);const aliases={groiunge:'Groningen',gronigen:'Groningen',reitphaven:'Reitdiephaven'};
 const fixed=words.map(word=>aliases[word.toLowerCase()]||word).join(' ');
 return fixed.toLowerCase()!==query.trim().toLowerCase()?fixed:null;
}
export function parseSearchResults(data){
 if(!Array.isArray(data?.features))throw new Error('Некорректный ответ поиска');
 const seen=new Set();const types={house:'Дом',street:'Улица',city:'Город',locality:'Район',district:'Район',country:'Страна',state:'Регион'};
 return data.features.flatMap(f=>{
  const p=f.properties||{},coords=f.geometry?.coordinates;
  if(f.geometry?.type!=='Point'||!Array.isArray(coords))return [];
  const [lng,lat]=coords;if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180)return [];
  const address=[p.street,p.housenumber].filter(Boolean).join(', ');
  const title=address||p.name||p.city||'Место на карте';
  const details=[...new Set([p.name&&p.name!==title?p.name:null,p.city,p.state,p.country].filter(Boolean))].filter(v=>v!==title).join(' · ');
  const key=p.osm_id?`${p.osm_type}/${p.osm_id}`:`${lat},${lng},${title}`;if(seen.has(key))return [];seen.add(key);
  return [{lat,lng,title,details,type:types[p.type]||'Место',house:!!p.housenumber,city:p.city||'',key}];
 });
}
export async function searchPlaces(query,{endpoint,signal,fetcher=fetch}){
 const url=new URL(endpoint);url.searchParams.set('q',query);url.searchParams.set('limit','7');
 const response=await fetcher(url,{signal});
 if(!response.ok)throw new Error(response.status===429?'Слишком много запросов. Подождите немного и повторите.':'Поиск временно недоступен. Повторите запрос или выберите место на карте.');
 return parseSearchResults(await response.json());
}
