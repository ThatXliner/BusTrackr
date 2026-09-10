import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {RoadPath} from './roads';

/** Authored street furniture for visual scale; placements are illustrative. */
export function buildStreetDetails(scene:T.Scene,paths:RoadPath[],height:(x:number,z:number)=>number){
 const metal=new T.MeshStandardMaterial({color:'#4c5353',metalness:.72,roughness:.42});
 const concrete=new T.MeshStandardMaterial({color:'#aaa79b',roughness:.96});
 const lens=new T.MeshStandardMaterial({color:'#e8e3ca',emissive:'#fff1c7',emissiveIntensity:.32,roughness:.3});
 const batches=new Map<T.Material,T.BufferGeometry[]>(),positions:T.Vector2[]=[];
 const add=(g:T.BufferGeometry,m:T.Material)=>{const plain=g.index?g.toNonIndexed():g;if(g.index)g.dispose();const batch=batches.get(m)||[];batch.push(plain);batches.set(m,batch);};
 const box=(p:T.Vector3,w:number,h:number,d:number,m:T.Material,yaw=0)=>{const g=new T.BoxGeometry(w,h,d);g.rotateY(yaw);g.translate(p.x,p.y,p.z);add(g,m);};
 const beam=(a:T.Vector3,b:T.Vector3,r1:number,r2:number)=>{const g=new T.CylinderGeometry(r2,r1,a.distanceTo(b),8);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());add(g,metal);};
 for(const path of paths){let chainage=0,nextStation=18,station=0;
  for(let i=0;i<path.profiles.length;i++){
   const a=path.points[i],b=path.points[i+1],length=a.distanceTo(b),profile=path.profiles[i];
   if(length<.001)continue;
   while(nextStation<chainage+length){
    const t=(nextStation-chainage)/length;nextStation+=48;const side=station++%2?1:-1;
    if(!profile.curb||profile.highway==='service'||t<0||t>1)continue;
    const along=b.clone().sub(a).normalize(),normal=new T.Vector2(-along.y,along.x).multiplyScalar(side);
    const p=a.clone().lerp(b,t).addScaledVector(normal,profile.width/2+1.7);
    if(positions.some(q=>p.distanceTo(q)<16))continue;positions.push(p);
    const base=new T.Vector3(p.x,height(p.x,p.y)+.32,p.y),inward=new T.Vector3(-normal.x,0,-normal.y),top=base.clone().add(new T.Vector3(0,7.3,0));
    box(base.clone().add(new T.Vector3(0,.13,0)),.46,.26,.46,concrete);
    beam(base,top,.1,.065);
    const elbow=top.clone().addScaledVector(inward,.48).add(new T.Vector3(0,.35,0)),tip=elbow.clone().addScaledVector(inward,1.35);
    beam(top,elbow,.065,.06);beam(elbow,tip,.06,.047);
    const yaw=Math.atan2(inward.x,inward.z),fixture=tip.clone().addScaledVector(inward,.38);
    box(fixture,.43,.2,1.06,metal,yaw);box(fixture.clone().add(new T.Vector3(0,-.105,0)),.34,.025,.85,lens,yaw);
    box(base.clone().add(new T.Vector3(0,.6,0)),.19,.34,.15,metal,yaw);
   }
   chainage+=length;
  }
 }
 for(const [material,parts] of batches){const geometry=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());const mesh=new T.Mesh(geometry,material);mesh.castShadow=material!==lens;mesh.receiveShadow=true;scene.add(mesh);}
 return {streetLights:positions.length};
}
