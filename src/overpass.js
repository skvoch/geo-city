function wait(ms,signal){
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(signal.reason);return;}
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  function abort(){clearTimeout(timer);reject(signal.reason);}
  signal.addEventListener('abort',abort,{once:true});
 });
}

export async function loadOverpass(query,endpoints,{signal,onFallback=()=>{},fetcher=fetch,staggerMs=7000,timeoutMs=35000}={}){
 if(!endpoints?.length)throw new Error('Нет источников данных карты');
 const active=new AbortController();
 const combined=signal?AbortSignal.any([signal,active.signal]):active.signal;
 const attempts=endpoints.map((endpoint,index)=>(async()=>{
  if(index){await wait(index*staggerMs,combined);onFallback(index);}
  const requestSignal=AbortSignal.any([combined,AbortSignal.timeout(timeoutMs)]);
  const url=typeof endpoint==='string'?endpoint:endpoint.url;
  const request=typeof endpoint==='string'?{method:'POST',body:new URLSearchParams({data:query}),signal:requestSignal}:{method:'GET',signal:requestSignal};
  const response=await fetcher(url,request);
  if(!response.ok)throw new Error(`Источник карты ответил ${response.status}`);
  const data=await response.json();
  if(data.remark||!Array.isArray(data.elements)||!data.elements.length)throw new Error(data.remark||'На участке нет данных');
  return data;
 })());
 try{return await Promise.any(attempts);}
 finally{active.abort();}
}
