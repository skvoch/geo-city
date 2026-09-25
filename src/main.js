import {decodeShareState,encodeSelfContainedShare,decodeEmbeddedGeo} from './share.js';
import {loadOverpass} from './overpass.js';
import {searchPlaces,searchSuggestion} from './search.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import osmtogeojson from 'osmtogeojson';
import {boundsFor,binarySTL,geoFromModelPoint} from './geometry.js';
const $=id=>document.getElementById(id);
const cities={'Москва':[55.764,37.638],'Санкт-Петербург':[59.939,30.315],'Казань':[55.791,49.118],'Екатеринбург':[56.8389,60.6057],'Новосибирск':[55.0302,82.9204],'Нижний Новгород':[56.3269,44.0059],'Самара':[53.1959,50.1002],'Владивосток':[43.1155,131.8855],'Сочи':[43.5855,39.7231],'Калининград':[54.7104,20.4522],'Краснодар':[45.0355,38.9753],'Воронеж':[51.6608,39.2003],'Уфа':[54.7388,55.9721],'Пермь':[58.01,56.2502],'Ростов-на-Дону':[47.222,39.72],'Красноярск':[56.015,92.893],'Иркутск':[52.287,104.28],'Томск':[56.484,84.948],'Тула':[54.193,37.618],'Ярославль':[57.626,39.884]};
let stage='search',loadVersion=0,loadController,loadRollback,loadedName='',sharedPin=null;
function setStage(next){
 stage=next;document.body.dataset.stage=next;
 for(const name of ['search','map','building','editor'])$(name+'-stage').hidden=name!==next;
 const index={search:0,map:1,building:2,editor:2}[next];
 document.querySelectorAll('.journey-step').forEach((el,i)=>{el.classList.toggle('active',i===index);el.classList.toggle('done',i<index);if(i===index)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
 if(next==='map')requestAnimationFrame(()=>{map.invalidateSize();fitSelection();});
 if(next==='editor'){document.querySelector('.preview-panel').classList.remove('model-reveal');requestAnimationFrame(()=>document.querySelector('.preview-panel').classList.add('model-reveal'));}
 window.scrollTo({top:0,behavior:'instant'});
 requestAnimationFrame(()=>{const heading=$(next+'-stage').querySelector('h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}});
}
function buildPhase(index,message){$('build-message').textContent=message;$('build-progress').setAttribute('aria-valuetext',`Этап ${index+1} из 3. ${message}`);$('build-progress-label').textContent=`ЭТАП ${index+1} / 3`;document.querySelectorAll('[data-phase], [data-progress-phase]').forEach(el=>{const i=Number(el.dataset.phase??el.dataset.progressPhase);el.classList.toggle('active',i===index);el.classList.toggle('done',i<index);});}
$('back-search').onclick=()=>{setPinMode(false);setStage('search');requestAnimationFrame(()=>$('search').focus());};
$('change-place').onclick=()=>{selected={...loadedCenter};$('area').value=loadedArea;$('place-name').textContent=loadedName||'Выбранный участок';selection();setPinMode(false);$('return-model').hidden=false;setStage('map');};
$('return-model').onclick=()=>setStage('editor');
$('pin-done').onclick=()=>{setPinMode(false);setStage('editor');};
$('cancel-build').onclick=()=>{loadController?.abort();loadVersion++;buildID++;loadRollback?.();loadRollback=null;loading=false;$('load').disabled=false;setStage('map');$('data-status').textContent='Сборка отменена. Можно изменить участок и попробовать снова.';};
let selected={lat:55.764,lng:37.638},loadedCenter={...selected},loadedArea=800,geo,meshData,pin=null,pinMarker=null,pinMode=false,isDemo=true,loading=false,mesh,wire=false;
const map=L.map('map',{zoomControl:false,attributionControl:false}).setView([selected.lat,selected.lng],16);
L.control.zoom({position:'topright'}).addTo(map);
let config={geocoder:'https://photon.komoot.io/api/',tiles:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',overpass:['https://overpass.private.coffee/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter','https://overpass-api.de/api/interpreter']};
try{const r=await fetch(`${import.meta.env.BASE_URL}services.json`);if(r.ok)config={...config,...await r.json()};}catch{}
L.tileLayer(config.tiles,{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
const rectangle=L.rectangle([[0,0],[0,0]],{color:'#eff7ff',weight:2,fillColor:'#a8ccff',fillOpacity:.13,dashArray:'8 5'}).addTo(map);
const cross=L.marker(selected,{interactive:false,icon:L.divIcon({className:'selection-center',html:'⊕',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(map);
function selection(){const b=boundsFor(selected,+$('area').value);rectangle.setBounds([[b.south,b.west],[b.north,b.east]]);cross.setLatLng(selected);$('coords').textContent=`${selected.lat.toFixed(4)}° N · ${selected.lng.toFixed(4)}° E`;$('area-out').textContent=`${$('area').value} м`;if(!isDemo)$('data-status').textContent='Участок изменён. Нажмите «Создать мою модель», чтобы обновить модель.';}
selection();
map.on('click',e=>{if(pinMode){const b=boundsFor(loadedCenter,loadedArea);if(e.latlng.lat<b.south||e.latlng.lat>b.north||e.latlng.lng<b.west||e.latlng.lng>b.east){$('data-status').textContent='Поставьте точку внутри участка построенной модели.';return;}pin={lat:e.latlng.lat,lng:e.latlng.lng};if(pinMarker)map.removeLayer(pinMarker);pinMarker=L.marker(pin,{icon:L.divIcon({className:'pin-icon',html:'♥',iconSize:[26,30],iconAnchor:[13,25]})}).addTo(map);$('pin-settings').hidden=false;setPinMode(false);rebuild();setStage('editor');return;}selected={lat:e.latlng.lat,lng:e.latlng.lng};$('place-name').textContent='Выбранное место';selection();});
function fitSelection(){const b=boundsFor(selected,+$('area').value);map.fitBounds([[b.south,b.west],[b.north,b.east]],{padding:[45,45],animate:false});}
$('area').oninput=()=>{selection();fitSelection();};
function goCity(name){cancelSearch();[selected.lat,selected.lng]=cities[name];$('place-name').textContent=name;map.setView(selected,16);selection();$('results').hidden=true;setStage('map');}
document.querySelectorAll('[data-city]').forEach(b=>b.onclick=()=>goCity(b.dataset.city));
let searchController,searchVersion=0,autocompleteTimer;const searchCache=new Map();
function cancelSearch(){clearTimeout(autocompleteTimer);searchController?.abort();searchVersion++;$('search-form').removeAttribute('aria-busy');$('search-submit').disabled=false;}
function showSearchMessage(text){$('results').hidden=false;$('results').replaceChildren();const message=document.createElement('p');message.className='search-message';message.textContent=text;$('results').append(message);}
function choosePlace(result){cancelSearch();selected={lat:result.lat,lng:result.lng};map.setView(selected,16);$('place-name').textContent=[result.city,result.title].filter((v,i,a)=>v&&a.indexOf(v)===i).join(' · ');$('search').value=$('place-name').textContent;selection();$('results').hidden=true;setPinMode(false);setStage('map');$('data-status').textContent='Адрес выбран. Уточните участок и создайте модель.';}
$('search').addEventListener('input',()=>{cancelSearch();$('results').hidden=true;const q=$('search').value.trim();if(q.length>=3&&!/^[\d\s.,;+-]+$/.test(q))autocompleteTimer=setTimeout(()=>{$('search-form').requestSubmit();},650);});
$('search').addEventListener('keydown',e=>{if(e.key==='Escape'){cancelSearch();$('results').hidden=true;}if(e.key==='ArrowDown'){$('results').querySelector('button')?.focus();e.preventDefault();}});
$('results').addEventListener('keydown',e=>{const buttons=[...$('results').querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(e.key==='Escape'){$('results').hidden=true;$('search').focus();}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}});
$('search-form').onsubmit=async e=>{
 e.preventDefault();cancelSearch();const version=searchVersion,q=$('search').value.trim();
 if(!q){showSearchMessage('Введите город, улицу и номер дома или координаты.');return;}
 const match=q.match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);
 if(match){const lat=+match[1],lng=+match[2];if(Math.abs(lat)>85||Math.abs(lng)>180){showSearchMessage('Проверьте координаты: широта от −85 до 85, долгота от −180 до 180.');return;}choosePlace({lat,lng,title:'По координатам'});return;}
 if(q.length<3){showSearchMessage('Введите хотя бы 3 символа.');return;}
 searchController=new AbortController();const controller=searchController;const timeout=setTimeout(()=>controller.abort(),15000);
 $('search-submit').disabled=true;$('search-form').setAttribute('aria-busy','true');showSearchMessage('Ищем адрес…');
 try{
 const key=config.geocoder+'|'+q.toLowerCase();let results=searchCache.get(key);
 if(!results){results=await searchPlaces(q,{endpoint:config.geocoder,signal:controller.signal});if(searchCache.size>=50)searchCache.delete(searchCache.keys().next().value);searchCache.set(key,results);}
 if(version!==searchVersion)return;
 showSearchMessage(results.length?'Выберите место из списка:':'Ничего не найдено. Проверьте написание города и улицы или уберите номер дома.');
 const suggestion=searchSuggestion(q);if(suggestion){const button=document.createElement('button');button.className='search-suggestion';button.textContent='Возможно, вы имели в виду: '+suggestion;button.onclick=()=>{$('search').value=suggestion;$('search-form').requestSubmit();};$('results').append(button);}
 for(const result of results){const button=document.createElement('button');button.className='search-result';const title=document.createElement('strong'),detail=document.createElement('span');title.textContent=result.title;detail.textContent=[result.type,result.details].filter(Boolean).join(' · ');button.append(title,detail);button.onclick=()=>choosePlace(result);$('results').append(button);}
 if(/\d/.test(q)&&results.length&&!results.some(r=>r.house)){const note=document.createElement('p');note.className='search-message';note.textContent='Номер дома не найден: показаны улицы и ближайшие совпадения.';$('results').append(note);}
 }catch(error){if(version!==searchVersion)return;showSearchMessage(error.name==='AbortError'?'Поиск не ответил вовремя. Попробуйте ещё раз или выберите место на карте.':error.message);const local=Object.keys(cities).filter(n=>n.toLowerCase()===q.toLowerCase());for(const name of local){const button=document.createElement('button');button.textContent=name+' · центр города';button.onclick=()=>goCity(name);$('results').append(button);}}
 finally{clearTimeout(timeout);if(version===searchVersion){$('search-submit').disabled=false;$('search-form').removeAttribute('aria-busy');}}
};
function setPinMode(value){pinMode=value;document.body.classList.toggle('pin-placement',value);$('add-pin').classList.toggle('active',value);$('add-pin').textContent=value?'Кликните по нужной точке на 3D-модели':'＋ Поставить точку на 3D-модели';$('model-status').textContent=value?'Кликните по модели, чтобы поставить маркер. Для отмены нажмите кнопку ещё раз.':'Настройте модель и скачайте STL.';}
$('add-pin').onclick=()=>setPinMode(!pinMode);
$('remove-pin').onclick=()=>{pin=null;if(pinMarker)map.removeLayer(pinMarker);pinMarker=null;$('pin-settings').hidden=true;rebuild();};
$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();
let renderer,scene,camera,controls,material;
try{
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);$('viewport').append(renderer.domElement);
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(38,1,.1,3000);camera.up.set(0,0,1);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.48;controls.minDistance=110;controls.maxDistance=1000;
 scene.add(new THREE.AmbientLight(0xc4d9ff,1.3));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-100,-140,250);scene.add(light);const fill=new THREE.DirectionalLight(0x94b6ff,1);fill.position.set(150,100,100);scene.add(fill);
 material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8,metalness:0,flatShading:true});
 new ResizeObserver(()=>{const w=$('viewport').clientWidth,h=$('viewport').clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();resetCamera();}).observe($('viewport'));
 renderer.setAnimationLoop(()=>{if(stage==='editor'){controls.update();renderer.render(scene,camera);}});
}catch(e){$('render-error').hidden=false;$('render-error').textContent='3D-предпросмотр недоступен. Включите аппаратное ускорение браузера. Экспорт STL остаётся доступен.';}
function resetCamera(){if(!camera)return;const s=+$('size').value;const distance=s*.78/Math.sin(Math.atan(Math.tan(38*Math.PI/360)*Math.min(camera.aspect,1)))*.98;camera.position.copy(new THREE.Vector3(.65,-1,1.3).normalize().multiplyScalar(distance));controls.target.set(0,0,3);controls.update();}
$('reset-view').onclick=resetCamera;$('top-view').onclick=()=>{if(camera){camera.position.set(0,-.01,+$('size').value*2.2);controls.target.set(0,0,0);controls.update();}};$('wire').onclick=()=>{wire=!wire;$('wire').setAttribute('aria-pressed',String(wire));if(material)material.wireframe=wire;};
let pressPoint;
renderer?.domElement.addEventListener('pointerdown',e=>{pressPoint=[e.clientX,e.clientY];});
renderer?.domElement.addEventListener('pointerup',e=>{
 if(!pinMode||stage!=='editor'||!mesh||!pressPoint||Math.hypot(e.clientX-pressPoint[0],e.clientY-pressPoint[1])>6)return;
 const rect=renderer.domElement.getBoundingClientRect();const mouse=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
 const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);const hit=ray.intersectObject(mesh,false)[0];if(!hit)return;
 const b=boundsFor(loadedCenter,loadedArea),location=geoFromModelPoint(hit.point.x,hit.point.y,b,+$('size').value,+$('margin').value);
 if(!location){$('model-status').textContent='Кликните внутри участка, не на поле основания.';return;}
 pin={lat:location.lat,lng:location.lng};if(pinMarker)map.removeLayer(pinMarker);pinMarker=L.marker(pin,{icon:L.divIcon({className:'pin-icon',html:'♥',iconSize:[26,30],iconAnchor:[13,25]})}).addTo(map);
 $('pin-settings').hidden=false;setPinMode(false);$('model-status').textContent='Маркер добавлен. Его форма и размер меняются справа.';rebuild();
});
const modelWorker=new Worker(new URL('./model.worker.js',import.meta.url),{type:'module'});
let buildID=0;const waiting=new Map();
modelWorker.onmessage=({data})=>{const task=waiting.get(data.id);if(!task)return;waiting.delete(data.id);data.error?task.reject(new Error(data.error)):task.resolve(data.result);};
modelWorker.onerror=()=>{for(const task of waiting.values())task.reject(new Error('Не удалось запустить построение модели'));waiting.clear();};
async function rebuild(){
 const id=++buildID,size=+$('size').value,base=+$('base').value,mult=+$('height').value,fallback=+$('fallback').value;
 const number=(name,min,max,defaultValue)=>Math.max(min,Math.min(max,+$(name).value||defaultValue));
 $('download').disabled=true;$('export-caption').textContent='Строим точные контуры…';
 const margin=+$('margin').value;$('margin-out').textContent=`${margin} мм`;const options={size,base,margin,height:mult,fallback,center:loadedCenter,area:loadedArea,roads:$('roads').checked,roadWidth:number('road-width',.6,4,1.2),roadHeight:number('road-height',.05,3,.25),frame:$('frame').checked,pin,pinSize:number('pin-size',4,20,9),pinShape:$('pin-shape').value,segments:+$('quality').value};
 $('size-out').textContent=`${size} мм`;$('base-out').textContent=`${base} мм`;$('height-out').textContent=`${mult.toLocaleString('ru')}×`;$('fallback-out').textContent=`${fallback} м`;
 try {
 const result=await new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});modelWorker.postMessage({id,geo,options});});
 if(id!==buildID)return false;
 meshData=result;const colors=result.colors;
 if(renderer){if(mesh){scene.remove(mesh);mesh.geometry.dispose();}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(meshData.vertices,3));g.setIndex(new THREE.BufferAttribute(meshData.indices,1));const rgb=new Float32Array(meshData.vertices.length);const shades=[new THREE.Color('#e7edf3'),new THREE.Color('#afc5de'),new THREE.Color('#ef765d')];for(let i=0;i<rgb.length/3;i++){const color=shades[colors[i]||0];rgb.set([color.r,color.g,color.b],i*3);}g.setAttribute('color',new THREE.BufferAttribute(rgb,3));g.computeVertexNormals();mesh=new THREE.Mesh(g,material);scene.add(mesh);}

 $('building-count').textContent=result.buildingCount;$('road-count').textContent=result.roadCount;$('model-size').textContent=`${size} × ${size}`;$('dimension').textContent=`${size} мм`;$('scale-label').textContent=`1:${Math.round(loadedArea*1000/size).toLocaleString('ru')}`;
 $('export-caption').textContent=`STL · мм · ${((84+meshData.indices.length/3*50)/1e6).toFixed(2)} МБ`;
 $('download').disabled=false;return true;
 }catch(error){if(id===buildID){meshData=null;$('model-status').textContent='Не удалось построить точную модель. Попробуйте меньший участок.';$('export-caption').textContent='Ошибка построения';console.error(error);}return false;}
}
let timer;document.querySelectorAll('.settings input,.settings select').forEach(el=>el.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(rebuild,120);}));
async function createModel(useSaved=false,embeddedGeo=null){
 if(loading)return;
 loading=true;const version=++loadVersion;loadController=new AbortController();const controller=loadController;
 const previous={geo,loadedCenter,loadedArea,loadedName,pin,meshData,isDemo};
 const restore=()=>{({geo,loadedCenter,loadedArea,loadedName,pin,meshData,isDemo}=previous);$('download').disabled=!meshData;if(meshData)$('export-caption').textContent=`STL · мм · ${((84+meshData.indices.length/3*50)/1e6).toFixed(2)} МБ`;};
 loadRollback=restore;
 const center=useSaved?{...loadedCenter}:{...selected},area=useSaved?loadedArea:+$('area').value,name=useSaved?loadedName:$('place-name').textContent;
 $('load').disabled=true;setStage('building');buildPhase(0,embeddedGeo?'Читаем модель из ссылки.':useSaved?'Возвращаемся к вашей модели.':'Находим здания и улицы на выбранном участке.');
 try{
 let next=embeddedGeo||(useSaved?geo:null);
 if(!next){
 const b=boundsFor(center,area),bbox=`${b.south},${b.west},${b.north},${b.east}`;
 const query=`[out:json][timeout:40];(way["building"](${bbox});relation["building"]["type"="multipolygon"](${bbox});way["highway"]["area"!="yes"](${bbox}););out body;>;out skel qt;`;
 const osmUrl=`https://api.openstreetmap.org/api/0.6/map.json?bbox=${b.west},${b.south},${b.east},${b.north}`;
 const endpoints=[...config.overpass,{url:osmUrl}];
 const data=await loadOverpass(query,endpoints,{signal:controller.signal,onFallback:index=>buildPhase(0,index===1?'Первый источник отвечает медленно. Проверяем резервный.':index===endpoints.length-1?'Публичные серверы заняты. Запрашиваем данные карты напрямую.':'Проверяем ещё один источник данных карты.')});
 if(version!==loadVersion)return;
 buildPhase(1,'Восстанавливаем контуры домов, дворов и дорог.');next=osmtogeojson(data);if(!next.features.length)throw new Error('empty');
 }
 if(version!==loadVersion)return;
 geo=next;loadedCenter=center;loadedArea=area;loadedName=name;isDemo=false;if(!useSaved)pin=sharedPin;sharedPin=null;
 buildPhase(2,'Поднимаем стены и объединяем детали в цельную модель.');
 if(!await rebuild())throw new Error('geometry');
 if(version!==loadVersion)return;
 if(!useSaved){if(pinMarker)map.removeLayer(pinMarker);pinMarker=null;if(pin)pinMarker=L.marker(pin,{icon:L.divIcon({className:'pin-icon',html:'♥',iconSize:[26,30],iconAnchor:[13,25]})}).addTo(map);}
 $('pin-settings').hidden=!pin;
 try{sessionStorage.setItem('kontur-map',JSON.stringify({geo,loadedCenter,loadedArea,loadedName}));}catch{}
 $('preview-tag').textContent='ТОЧНЫЕ КОНТУРЫ';
 const missing=geo.features.filter(f=>f.properties?.building&&!f.properties.height&&!f.properties['building:levels']).length;
 $('model-status').textContent=`Высота по умолчанию: ${missing} зданий · основание плоское`;
 $('model-place').textContent=loadedName||'Выбранный участок';$('data-status').textContent='Модель готова. Можно уточнить участок или вернуться к модели.';
 $('resume-model').hidden=false;$('return-model').hidden=false;setPinMode(false);setStage('editor');
 }catch(error){if(version===loadVersion){restore();setStage('map');$('data-status').textContent='Не удалось собрать участок. Источник карты занят или здесь нет данных. Попробуйте ещё раз или уменьшите участок.';}}
 finally{if(version===loadVersion){loadRollback=null;loading=false;$('load').disabled=false;}}
}
$('load').onclick=()=>createModel();
$('resume-model').onclick=()=>{if(meshData){$('model-place').textContent=loadedName;setStage('editor');}else createModel(true);};
function shareState(){return {center:loadedCenter,area:loadedArea,name:loadedName,size:+$('size').value,base:+$('base').value,margin:+$('margin').value,height:+$('height').value,fallback:+$('fallback').value,roadWidth:+$('road-width').value,roadHeight:+$('road-height').value,pinSize:+$('pin-size').value,quality:+$('quality').value,frame:$('frame').checked,roads:$('roads').checked,pinShape:$('pin-shape').value,pin};}
$('share').onclick=async()=>{if(!meshData||!geo)return;const button=$('share');button.disabled=true;button.textContent='Упаковываем модель…';try{const url=new URL(location.href);url.hash=await encodeSelfContainedShare(shareState(),geo);url.search='';$('share-url').value=url.href;$('share-result').hidden=false;$('copy-share').textContent='Копировать';$('share-note').textContent='Модель уже внутри ссылки. При открытии данные карты не загружаются. Размер ссылки: '+Math.ceil(url.href.length/1024)+' КБ.';}catch(error){$('model-status').textContent='Не удалось подготовить ссылку. Попробуйте уменьшить участок.';console.error(error);}finally{button.disabled=false;button.textContent='↗ Поделиться ссылкой';}};
$('copy-share').onclick=async()=>{try{await navigator.clipboard.writeText($('share-url').value);$('copy-share').textContent='Скопировано ✓';}catch{$('share-url').focus();$('share-url').select();$('copy-share').textContent='Выделите и скопируйте ссылку';}};
$('download').onclick=async()=>{const button=$('download');button.disabled=true;button.textContent='Подготавливаем STL…';await new Promise(r=>setTimeout(r,30));try{clearTimeout(timer);if(!await rebuild())throw new Error('geometry');const buffer=binarySTL(meshData.vertices,meshData.indices);const blob=new Blob([buffer],{type:'model/stl'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`kontur-${isDemo?'DEMO':loadedCenter.lat.toFixed(4)+'-'+loadedCenter.lng.toFixed(4)}-${$('size').value}mm.stl`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);$('model-status').textContent=isDemo?'Скачан учебный пример. Для своего места загрузите данные карты.':'STL скачан. Откройте его в слайсере; единицы — миллиметры.';}catch(e){$('model-status').textContent='Не удалось создать STL. Попробуйте снизить детализацию.';}finally{button.disabled=!meshData;button.textContent='↓ Скачать STL';}};
geo=null;
try{const saved=JSON.parse(sessionStorage.getItem('kontur-map'));if(saved?.geo?.features){geo=saved.geo;loadedCenter=saved.loadedCenter;loadedArea=saved.loadedArea;loadedName=saved.loadedName||'Сохранённый участок';isDemo=false;$('resume-model').hidden=false;}}catch{}
$('download').disabled=true;

const shared=decodeShareState(location.hash);
if(shared){
 selected={...shared.center};$('area').value=shared.area;$('place-name').textContent=shared.name;
 for(const key of ['size','base','margin','height','fallback','quality'])$(key).value=shared[key];
 $('road-width').value=shared.roadWidth;$('road-height').value=shared.roadHeight;$('pin-size').value=shared.pinSize;$('frame').checked=shared.frame;$('roads').checked=shared.roads;$('pin-shape').value=shared.pinShape;
 sharedPin=shared.pin;selection();map.setView(selected,16);
 (async()=>{try{const embedded=await decodeEmbeddedGeo(location.hash);createModel(false,embedded);}catch(error){$('results').hidden=false;$('results').textContent='Не удалось прочитать модель из ссылки. Попросите отправить ссылку ещё раз.';console.error(error);}})();
}


