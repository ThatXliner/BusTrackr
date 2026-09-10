import * as T from 'three';
import {createBuildingShell,createPitchedRoof} from './building-shell';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

type Building={id:number;kind:string;height:number;heightSource?:string};
export type RoofLevels={id:number;pointCount:number;eave:number;ridge:number};
/** Footprint-based roadside architecture. Roof style and facade openings are inferred. */
export async function createRoadsideBuildings(scene:T.Scene,height:(x:number,z:number)=>number,nearestRoad:(p:T.Vector2)=>T.Vector2,roofLevels:Map<number,RoofLevels>=new Map()){
 const shingles=await new T.TextureLoader().loadAsync(import.meta.env.BASE_URL+'local-scene/shingles-albedo.png');shingles.colorSpace=T.SRGBColorSpace;shingles.wrapS=shingles.wrapT=T.RepeatWrapping;shingles.anisotropy=8;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const context=canvas.getContext('2d')!,pixels=context.createImageData(256,256);let seed=24139;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<pixels.data.length;i+=4){const v=218+(random()-.5)*28;pixels.data[i]=v;pixels.data[i+1]=v;pixels.data[i+2]=v;pixels.data[i+3]=255;}context.putImageData(pixels,0,0);
 const stucco=new T.CanvasTexture(canvas);stucco.colorSpace=T.SRGBColorSpace;stucco.wrapS=stucco.wrapT=T.RepeatWrapping;stucco.anisotropy=8;
 const wall=new T.MeshStandardMaterial({map:stucco,bumpMap:stucco,bumpScale:.018,roughness:.91,vertexColors:true});
 const roof=new T.MeshStandardMaterial({map:shingles,bumpMap:shingles,bumpScale:.025,roughness:.88,vertexColors:true});
 const flatRoof=new T.MeshStandardMaterial({color:'#92968f',roughness:.94});
 const trim=new T.MeshStandardMaterial({color:'#d5d3c4',roughness:.72});
 const glass=new T.MeshStandardMaterial({color:'#72868b',metalness:.52,roughness:.18,envMapIntensity:.85});
 const frame=new T.MeshStandardMaterial({color:'#38403e',roughness:.68});
 const door=new T.MeshStandardMaterial({color:'#716d5e',roughness:.82});
 const metal=new T.MeshStandardMaterial({color:'#a4a9a6',metalness:.42,roughness:.66});
 const palette=['#ede5d3','#cbd0c4','#d6c8ad','#d0cbc1','#e1d9c8'];
 const batches=new Map<string,{material:T.Material;geometries:T.BufferGeometry[];detail:boolean}>();const detailMeshes:T.Mesh[]=[];let chunk='',detail=false;
 const stats={pitchedRoofs:0,flatRoofs:0,detailedFacades:0,maximumRoofRise:0,terrainAdjustedIds:[] as number[],terrainIntrusionIds:[] as number[],maximumGroundSpan:0,measuredRoofs:0,rejectedRoofProfiles:0};
 function add(geometry:T.BufferGeometry,material:T.Material,color='#ffffff'){
  const g=geometry.index?geometry.toNonIndexed():geometry;if(g!==geometry)geometry.dispose();
  if((material as T.MeshStandardMaterial).vertexColors){const c=new T.Color(color),colors=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}g.setAttribute('color',new T.BufferAttribute(colors,3));}
  const key=chunk+':'+(detail?'detail:':'structure:')+material.uuid;let batch=batches.get(key);if(!batch){batch={material,geometries:[],detail};batches.set(key,batch);}batch.geometries.push(g);
 }
 function box(p:T.Vector3,w:number,h:number,d:number,material:T.Material,yaw=0,color?:string){const g=new T.BoxGeometry(w,h,d),pos=g.getAttribute('position'),uv=g.getAttribute('uv'),normal=g.getAttribute('normal');for(let i=0;i<pos.count;i++){const u=Math.abs(normal.getX(i))>.5?pos.getZ(i):pos.getX(i),v=Math.abs(normal.getY(i))>.5?pos.getZ(i):pos.getY(i);uv.setXY(i,u/2,v/2);}g.rotateY(yaw);g.translate(p.x,p.y,p.z);add(g,material,color);}
 const areaOf=(ring:T.Vector2[])=>ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p.x*q.y-q.x*p.y;},0)/2;
 function build(building:Building,ring:T.Vector2[]){
  const area=Math.abs(areaOf(ring)),center=ring.reduce((p,q)=>p.add(q),new T.Vector2()).multiplyScalar(1/ring.length),roadPoint=nearestRoad(center),near=center.distanceTo(roadPoint)<48;
  chunk=`${Math.floor(center.x/180)},${Math.floor(center.y/180)}`;detail=false;
  const groundSamples=ring.map(p=>height(p.x,p.y)),base=Math.min(...groundSamples)-.22,caravan=building.kind==='static_caravan';
  const sourceHeight=building.height<1.5?2.8:building.heightSource==='estimate'&&caravan?3.2:building.height;
  const bounds=new T.Box2().setFromPoints(ring),size=bounds.getSize(new T.Vector2()),residential=caravan||building.kind==='house'||(area>=45&&area<310&&sourceHeight<8&&Math.max(size.x,size.y)<32);
  const levels=roofLevels.get(building.id),measured=levels&&Number.isFinite(levels.eave)&&Number.isFinite(levels.ridge)&&levels.ridge>=levels.eave&&levels.pointCount>=200&&levels.eave-base>=2&&levels.eave-base<=20&&levels.ridge-levels.eave<=4;
  if(measured)stats.measuredRoofs++;else if(levels)stats.rejectedRoofProfiles++;
  const pitched=residential&&area>25&&(!measured||levels.ridge-levels.eave>.25),wallColor=palette[Math.abs(building.id)%palette.length];
  let axis=ring[1].clone().sub(ring[0]);for(let i=1;i<ring.length;i++){const edge=ring[(i+1)%ring.length].clone().sub(ring[i]);if(edge.lengthSq()>axis.lengthSq())axis=edge;}axis.normalize();const perpendicular=new T.Vector2(-axis.y,axis.x);
  const widths=ring.map(p=>p.clone().sub(center).dot(perpendicular)),depth=Math.max(...widths)-Math.min(...widths);
  const rise=pitched?(measured?levels.ridge-levels.eave:Math.min(caravan?.45:2.5,depth*.23,Math.max(0,sourceHeight-2.45))):0,sourceEave=measured?levels.eave-base:sourceHeight-rise;
  // A source height can be shorter than the local terrain span. Keep the roof
  // above the uphill ground, while the existing foundation reaches the low side.
  const eave=Math.max(sourceEave,Math.max(...groundSamples)-base+.25);
  if(eave>sourceEave||building.height<1.5)stats.terrainAdjustedIds.push(building.id);
  stats.maximumGroundSpan=Math.max(stats.maximumGroundSpan,Math.max(...groundSamples)-Math.min(...groundSamples));if(Math.max(...groundSamples)>base+eave)stats.terrainIntrusionIds.push(building.id);
  const shape=new T.Shape(ring.map(p=>new T.Vector2(p.x,-p.y))),shell=createBuildingShell(shape,eave);shell.rotateX(-Math.PI/2);shell.translate(0,base,0);
  // Meter-scale wall UVs avoid stretching one patch of stucco over an entire facade.
  const shellPos=shell.getAttribute('position'),shellNormal=shell.getAttribute('normal'),shellUV=shell.getAttribute('uv');for(let i=0;i<shellPos.count;i++){const u=Math.abs(shellNormal.getX(i))>.5?shellPos.getZ(i):shellPos.getX(i);shellUV.setXY(i,u/2,(shellPos.getY(i)-base)/2);}add(shell,wall,wallColor);
  const cap=new T.ShapeGeometry(shape);cap.rotateX(-Math.PI/2);
  if(pitched){
   const geometry=createPitchedRoof(cap,ring,axis,center,base+eave,rise);
   const roofPositions=geometry.getAttribute('position');for(let i=0;i<roofPositions.count;i++)stats.maximumRoofRise=Math.max(stats.maximumRoofRise,roofPositions.getY(i)-base-eave);
   add(geometry,roof,building.id%3===0?'#c9c0ad':'#dddeda');stats.pitchedRoofs++;
  }else{cap.translate(0,base+eave+.02,0);add(cap,flatRoof);stats.flatRoofs++;}
  const orientation=Math.sign(areaOf(ring));
  const front=ring.reduce((best,a,i)=>{const b=ring[(i+1)%ring.length],mid=a.clone().lerp(b,.5),old=ring[best].clone().lerp(ring[(best+1)%ring.length],.5);return mid.distanceTo(roadPoint)<old.distanceTo(roadPoint)?i:best;},0);
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],delta=b.clone().sub(a),length=delta.length();if(length<.4)continue;const along=delta.clone().normalize(),outward=new T.Vector2(along.y,-along.x).multiplyScalar(orientation),yaw=-Math.atan2(delta.y,delta.x);
   const point=(d:number,y:number,offset=0)=>{const p=a.clone().addScaledVector(along,d).addScaledVector(outward,offset);return new T.Vector3(p.x,base+y,p.y);};
   detail=false;box(point(length/2,eave+.01,.07),length+.1,.18,.22,trim,yaw);
   if(!pitched){box(point(length/2,eave+.18),length,.36,.2,wall,yaw,wallColor);box(point(length/2,eave+.38),length+.08,.06,.3,trim,yaw);}
   if(!near||length<3)continue;detail=true;
   const groundAtFace=height((a.x+b.x)/2,(a.y+b.y)/2)-base,entryY=Math.max(.05,groundAtFace);
   const frontFace=i===front,doorAt=length*.7,garageAt=length*.27,hasDoor=frontFace&&length>5&&entryY+2.2<eave,garage=frontFace&&residential&&length>9&&!caravan&&entryY+2.15<eave;
   if(hasDoor){box(point(doorAt,entryY+1.05,.04),1.08,2.1,.12,frame,yaw);box(point(doorAt,entryY+1.05,.12),.91,1.96,.04,door,yaw);box(point(doorAt+.32,entryY+1,.17),.035,.16,.045,metal,yaw);box(point(doorAt,entryY+.04,.45),1.45,.12,1.05,trim,yaw);if(!residential)box(point(doorAt,entryY+2.25,.45),2.1,.1,1.0,metal,yaw);}
   if(garage){box(point(garageAt,entryY+1.04,.035),3.05,2.12,.1,frame,yaw);box(point(garageAt,entryY+1.04,.095),2.9,1.99,.08,trim,yaw);for(let panel=1;panel<6;panel++)box(point(garageAt,entryY+panel*.335,.14),2.86,.035,.025,door,yaw);}
   const floors=Math.max(1,Math.floor(eave/2.8)),spacing=residential?3.3:4.1;
   for(let floor=0;floor<floors;floor++)for(let distance=1.7;distance<length-1.4;distance+=spacing){if(floor===0&&(hasDoor&&Math.abs(distance-doorAt)<1.45||garage&&Math.abs(distance-garageAt)<2.1))continue;const windowHeight=Math.min(1.38,eave-entryY-1.05),y=entryY+.7+windowHeight/2+floor*2.8,p=point(distance,y);if(windowHeight<.65||y+windowHeight/2+.1>eave-.15||p.y-windowHeight/2-height(p.x,p.z)<.4)continue;const width=residential?1.45:2.2;
    box(point(distance,y,.05),width+.15,windowHeight+.17,.13,trim,yaw);box(point(distance,y,.13),width,windowHeight,.06,glass,yaw);box(point(distance,y,.18),.05,windowHeight+.01,.03,frame,yaw);box(point(distance,y-windowHeight/2-.08,.15),width+.24,.09,.26,trim,yaw);
   }
   if(residential&&length>6)box(point(.3,eave/2,.12),.075,eave,.075,trim,yaw);
  }
  if(near){detail=true;stats.detailedFacades++;if(!residential&&area>250){const maxUnits=Math.min(4,Math.floor(area/250));for(let n=0;n<maxUnits;n++){const p=center.clone().lerp(ring[n%ring.length],.25);box(new T.Vector3(p.x,base+eave+.38,p.y),1.5,.72,1.15,metal);box(new T.Vector3(p.x,base+eave+.76,p.y),1.35,.06,1,frame);}}}
 }
 function finish(){for(const {material,geometries,detail} of batches.values()){const merged=mergeGeometries(geometries,false);if(merged){const mesh=new T.Mesh(merged,material);mesh.castShadow=material!==glass;mesh.receiveShadow=true;scene.add(mesh);if(detail){merged.computeBoundingSphere();detailMeshes.push(mesh);}}geometries.forEach(g=>g.dispose());}return stats;}
 function update(camera:T.Camera){for(const mesh of detailMeshes){const sphere=mesh.geometry.boundingSphere!;mesh.visible=camera.position.distanceTo(sphere.center)-sphere.radius<240;}}
 return {build,finish,update};
}
