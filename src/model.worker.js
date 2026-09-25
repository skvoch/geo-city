import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import {buildVectorModel} from './vector-model.js';
const ready=Module({locateFile:()=>wasmUrl}).then(kernel=>{kernel.setup();return kernel;});
self.onmessage=async({data:{id,geo,options}})=>{
 try {const kernel=await ready;const result=buildVectorModel(kernel,geo,options);self.postMessage({id,result},[result.vertices.buffer,result.indices.buffer,result.colors.buffer]);}
 catch(error){self.postMessage({id,error:String(error.message||error)});}
};
