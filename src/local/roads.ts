import * as T from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {conformTriangle,type TerrainGrid} from './terrain-conform';

export type RoadProfile={name:string;highway:string;wayId:number|null;width:number;lanes:number;curb:boolean};
export type RoadPath={points:T.Vector2[];profiles:RoadProfile[]};
/** OSM centerlines with authored width estimates. This is scenery, not navigation data. */
export function roadNormal(points:T.Vector2[],index:number){
 const before=points[index].clone().sub(points[Math.max(0,index-1)]).normalize();
 const after=points[Math.min(points.length-1,index+1)].clone().sub(points[index]).normalize();
 if(!before.lengthSq())before.copy(after);if(!after.lengthSq())after.copy(before);
 const tangent=before.add(after).normalize();return new T.Vector2(-tangent.y,tangent.x);
}
export function laneOffset(profile:RoadProfile){return Math.min(profile.width/2-1.4,(profile.lanes/2-.5)*3.4);}
/** Round only the immediate corner, leaving the canonical route data untouched. */
export function roundRoadPath(points:T.Vector2[],profiles:RoadProfile[]):RoadPath{
 const rounded=[points[0]],out:RoadProfile[]=[];
 const push=(p:T.Vector2,profile:RoadProfile)=>{if(p.distanceTo(rounded.at(-1)!)>.001){rounded.push(p);out.push(profile);}};
 for(let i=1;i<points.length-1;i++){
  const a=points[i-1],b=points[i],c=points[i+1],u=b.clone().sub(a).normalize(),v=c.clone().sub(b).normalize();
  if(u.dot(v)>.998){push(b,profiles[i-1]);continue;}
  const cut=Math.min(6,a.distanceTo(b)*.24,b.distanceTo(c)*.24),start=b.clone().addScaledVector(u,-cut),end=b.clone().addScaledVector(v,cut);
  push(start,profiles[i-1]);for(let step=1;step<=8;step++){const t=step/8,p=start.clone().multiplyScalar((1-t)*(1-t)).addScaledVector(b,2*t*(1-t)).addScaledVector(end,t*t);push(p,profiles[step<=4?i-1:i]);}
 }
 push(points.at(-1)!,profiles.at(-1)!);return {points:rounded,profiles:out};
}

export function buildRoads(scene:T.Scene,paths:RoadPath[],height:(x:number,z:number)=>number,grid:TerrainGrid){
 const textureCanvas=document.createElement('canvas');textureCanvas.width=textureCanvas.height=512;
 const ctx=textureCanvas.getContext('2d')!,pixels=ctx.createImageData(512,512);let seed=39284;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<pixels.data.length;i+=4){const grain=(random()-.5)*35;pixels.data[i]=91+grain;pixels.data[i+1]=91+grain;pixels.data[i+2]=86+grain;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);
 // Fine aggregate and a few quiet sealed cracks repeat at an eight-meter scale.
 ctx.strokeStyle='#292c2b35';ctx.lineWidth=1.1;
 for(let i=0;i<9;i++){let x=random()*512,y=random()*512;ctx.beginPath();ctx.moveTo(x,y);for(let j=0;j<7;j++){x+=(random()-.5)*35;y+=random()*13;ctx.lineTo(x,y);}ctx.stroke();}
 const asphaltMap=new T.CanvasTexture(textureCanvas);asphaltMap.colorSpace=T.SRGBColorSpace;asphaltMap.wrapS=asphaltMap.wrapT=T.RepeatWrapping;asphaltMap.anisotropy=8;
 const asphalt=new T.MeshStandardMaterial({map:asphaltMap,bumpMap:asphaltMap,bumpScale:.012,roughness:.96,polygonOffset:true,polygonOffsetFactor:-1});
 const pavingCanvas=document.createElement('canvas');pavingCanvas.width=pavingCanvas.height=256;
 const pavingContext=pavingCanvas.getContext('2d')!,pavingPixels=pavingContext.createImageData(256,256);
 for(let i=0;i<pavingPixels.data.length;i+=4){const grain=(random()-.5)*23;for(let k=0;k<3;k++)pavingPixels.data[i+k]=205+grain;pavingPixels.data[i+3]=255;}pavingContext.putImageData(pavingPixels,0,0);
 const pavingMap=new T.CanvasTexture(pavingCanvas);pavingMap.colorSpace=T.SRGBColorSpace;pavingMap.wrapS=pavingMap.wrapT=T.RepeatWrapping;
 const concrete=new T.MeshStandardMaterial({color:'#c4c2b5',map:pavingMap,bumpMap:pavingMap,bumpScale:.014,roughness:.94});
 const paving=new T.MeshStandardMaterial({color:'#d6d0bf',map:pavingMap,bumpMap:pavingMap,bumpScale:.012,roughness:.95});
 const shoulder=new T.MeshStandardMaterial({color:'#aa9c7f',map:pavingMap,bumpMap:pavingMap,bumpScale:.03,roughness:1,transparent:true,depthWrite:false});
 shoulder.onBeforeCompile=shader=>{shader.vertexShader='attribute float shoulderBlend; varying float vShoulderBlend;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvShoulderBlend=shoulderBlend;');shader.fragmentShader='varying float vShoulderBlend;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>','#include <alphamap_fragment>\ndiffuseColor.a*=smoothstep(0.0,0.5,vShoulderBlend);');};
 shoulder.customProgramCacheKey=()=> 'feathered-gravel-v1';
 const white=new T.MeshStandardMaterial({color:'#dedbca',roughness:.9,polygonOffset:true,polygonOffsetFactor:-2});
 const yellow=new T.MeshStandardMaterial({color:'#d6b15f',roughness:.9,polygonOffset:true,polygonOffsetFactor:-2});
 type Batch={positions:number[];uvs:number[];blend:number[]};const batches=new Map<T.Material,Batch>();
 const emitTriangle=(a:T.Vector3,b:T.Vector3,c:T.Vector3,m:T.Material)=>{let batch=batches.get(m);if(!batch){batch={positions:[],uvs:[],blend:[]};batches.set(m,batch);}for(const p of [a,b,c]){batch.positions.push(p.x,p.y,p.z);batch.uvs.push(p.x/8,p.z/8);if(m===shoulder)batch.blend.push(T.MathUtils.clamp((p.y-height(p.x,p.z)-.015)/.125,0,1));}};
 const triangle=(a:T.Vector3,b:T.Vector3,c:T.Vector3,m:T.Material)=>conformTriangle(a,b,c,grid,height,(aa,bb,cc)=>emitTriangle(aa,bb,cc,m));
 const quad=(a:T.Vector3,b:T.Vector3,c:T.Vector3,d:T.Vector3,m:T.Material)=>{if(b.clone().sub(a).cross(c.clone().sub(a)).y>=0){triangle(a,b,c,m);triangle(b,d,c,m);}else{triangle(a,c,b,m);triangle(b,c,d,m);}};
 const seen=new Set<string>();let meters=0;
 const junctions=paths.flatMap(path=>path.points.flatMap((point,i)=>i>0&&i<path.profiles.length&&path.profiles[i-1].name!==path.profiles[i].name?[{point,radius:Math.max(path.profiles[i-1].width,path.profiles[i].width)/2+6}]:[]));
 const inJunction=(p:T.Vector3)=>junctions.some(j=>Math.hypot(p.x-j.point.x,p.z-j.point.y)<j.radius);
 for(const path of paths){const normals=path.points.map((_,i)=>roadNormal(path.points,i));let chainage=0;
  for(let i=0;i<path.points.length-1;i++){
   const a=path.points[i],b=path.points[i+1],length=a.distanceTo(b),profile=path.profiles[i];if(length<.1)continue;
   const key=[`${a.x.toFixed(2)},${a.y.toFixed(2)}`,`${b.x.toFixed(2)},${b.y.toFixed(2)}`].sort().join('|');if(seen.has(key)){chainage+=length;continue;}seen.add(key);meters+=length;
   const tangent=b.clone().sub(a).normalize(),normal=new T.Vector2(-tangent.y,tangent.x);
   const n0=normals[i].clone().multiplyScalar(1/Math.max(.65,normals[i].dot(normal))),n1=normals[i+1].clone().multiplyScalar(1/Math.max(.65,normals[i+1].dot(normal)));
   const point=(distance:number,offset:number,lift=0)=>{const t=T.MathUtils.clamp(distance/length,0,1),p=a.clone().lerp(b,t).add(n0.clone().lerp(n1,t).multiplyScalar(offset));return new T.Vector3(p.x,height(p.x,p.y)+.16+lift,p.y);};
   const half=profile.width/2,steps=Math.ceil(length/2);
   const crossSteps=Math.ceil(profile.width/1.2);
   for(let j=0;j<steps;j++){const d0=j/steps*length,d1=(j+1)/steps*length;for(let k=0;k<crossSteps;k++){const lo=-half+k/crossSteps*profile.width,hi=-half+(k+1)/crossSteps*profile.width;quad(point(d0,lo),point(d0,hi),point(d1,lo),point(d1,hi),asphalt);}}
   const corner=(index:number)=>{if(index<=0||index>=path.points.length-1)return true;const u=path.points[index].clone().sub(path.points[index-1]).normalize(),v=path.points[index+1].clone().sub(path.points[index]).normalize();return u.dot(v)<.88||path.profiles[index-1].name!==path.profiles[index].name;};
   const start=corner(i)?Math.min(7,length/2):0,end=length-(corner(i+1)?Math.min(7,length/2):0);
   const stripe=(offset:number,width:number,dashed:boolean,mat:T.Material)=>{for(let d=start;d<end;d+=.8){if(dashed&&(chainage+d)%12>3||inJunction(point(d+.4,offset)))continue;quad(point(d,offset-width/2,.022),point(d,offset+width/2,.022),point(Math.min(d+.8,end),offset-width/2,.022),point(Math.min(d+.8,end),offset+width/2,.022),mat);}};
   if(profile.highway!=='service'&&length>3){stripe(-.12,.1,false,yellow);stripe(.12,.1,false,yellow);for(let lane=1;lane<profile.lanes/2;lane++)for(const sign of [-1,1])stripe(sign*lane*3.4,.12,true,white);for(const sign of [-1,1])stripe(sign*(half-.4),.12,false,white);}
   // Curbs stop short of turns and road-name changes rather than blocking junction mouths.
   if(profile.curb)for(const sign of [-1,1])for(let d=start;d<end;d+=2.4){const next=Math.min(d+2.38,end),inner=sign*half,outer=sign*(half+.22);if(inJunction(point((d+next)/2,outer)))continue;const p0=point(d,inner),p1=point(d,outer,.15),p2=point(next,inner),p3=point(next,outer,.15),t0=point(d,inner,.15),t2=point(next,inner,.15);quad(t0,p1,t2,p3,concrete);if(sign>0){triangle(p0,t0,p2,concrete);triangle(t0,t2,p2,concrete);}else{triangle(p0,p2,t0,concrete);triangle(t0,p2,t2,concrete);}}
   // Authored sidewalk slabs and narrow gravel shoulders add readable ground scale.
   // Dimensions and driveway spacing are visual estimates, not a curb survey.
   for(const sign of [-1,1])for(let d=start;d<end;d+=2.4){
    const next=Math.min(d+(profile.curb?2.36:2.4),end),mid=(d+next)/2;
    if(inJunction(point(mid,sign*(half+1))))continue;
    if(profile.curb){
     const driveway=(chainage+mid)%42<5;
     const lo=sign*(half+.24),hi=sign*(half+2.1),lift=driveway?.04:.15;
     quad(point(d,lo,lift),point(d,hi,lift),point(next,lo,lift),point(next,hi,lift),paving);
    }else{
     const lo=sign*half,hi=sign*(half+.6);
     quad(point(d,lo,-.02),point(d,hi,-.145),point(next,lo,-.02),point(next,hi,-.145),shoulder);
    }
   }
   chainage+=length;
  }
 }
 let minimumClearance=Infinity,worstPoint:number[]=[];const pavement=batches.get(asphalt)!.positions;for(let i=0;i<pavement.length;i+=9){for(const weights of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]){let x=0,y=0,z=0;for(let j=0;j<3;j++){x+=pavement[i+j*3]*weights[j];y+=pavement[i+j*3+1]*weights[j];z+=pavement[i+j*3+2]*weights[j];}const clearance=y-height(x,z);if(clearance<minimumClearance){minimumClearance=clearance;worstPoint=[x,y,z];}}}
 for(const [material,batch] of batches){let geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(batch.positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(batch.uvs,2));if(material===shoulder)geometry.setAttribute('shoulderBlend',new T.Float32BufferAttribute(batch.blend,1));if(material!==concrete){const welded=mergeVertices(geometry,1e-4);geometry.dispose();geometry=welded;}geometry.computeVertexNormals();const mesh=new T.Mesh(geometry,material);mesh.receiveShadow=true;mesh.castShadow=material===concrete;scene.add(mesh);}
 return {meters:Math.round(meters),minimumClearance,worstPoint};
}
