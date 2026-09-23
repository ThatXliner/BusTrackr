import * as T from 'three';
import {PARKING_SURFACE_LIFT,type ParkingLayout} from './parking';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

type Pixel=readonly [number,number];
/** Positions traced from the bundled 2048×1200 public-domain campus orthophoto.
 * Heights, fence construction, dugout details and parked vehicles are approximations.
 */
export function buildGrounds(scene:T.Scene,project:(p:{lon:number;lat:number})=>T.Vector2,terrainHeight:(x:number,z:number)=>number,parking:ParkingLayout){
 const height=(x:number,z:number)=>terrainHeight(x,z)+.12;
 const pixel=(p:Pixel)=>project({lon:-121.8294+p[0]/2048*.0078,lat:37.2774-p[1]/1200*.0036});
 const at=(p:Pixel,lift=0)=>{const v=pixel(p);return new T.Vector3(v.x,height(v.x,v.y)+lift,v.y);};
 const batches=new Map<T.Material,T.BufferGeometry[]>();
 const add=(g:T.BufferGeometry,m:T.Material)=>{const parts=batches.get(m)||[];if(g.index){const plain=g.toNonIndexed();g.dispose();g=plain;}parts.push(g);batches.set(m,parts);};
 const steel=new T.MeshStandardMaterial({color:'#a4aaa4',metalness:.65,roughness:.42});
 const dark=new T.MeshStandardMaterial({color:'#253d48',roughness:.8});
 const yellow=new T.MeshStandardMaterial({color:'#c6ac54',roughness:.7});
 const concrete=new T.MeshStandardMaterial({color:'#aaa99a',roughness:.93});
 const white=new T.MeshStandardMaterial({color:'#dedbc9',roughness:.8});
 const beam=(a:T.Vector3,b:T.Vector3,r:number,m:T.Material)=>{const g=new T.CylinderGeometry(r,r,a.distanceTo(b),6);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());add(g,m);};
 const box=(p:T.Vector3,w:number,h:number,d:number,m:T.Material,yaw=0)=>{const g=new T.BoxGeometry(w,h,d);g.rotateY(yaw);g.translate(...p.toArray());add(g,m);};
 // Alpha-tested chain link disappears gracefully into its mipmaps at long range.
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d')!;
 ctx.strokeStyle='#7c8986';ctx.lineWidth=2;
 for(let offset=-128;offset<=256;offset+=32){ctx.beginPath();ctx.moveTo(offset,0);ctx.lineTo(offset+128,128);ctx.stroke();ctx.beginPath();ctx.moveTo(offset,0);ctx.lineTo(offset-128,128);ctx.stroke();}
 const net=new T.CanvasTexture(canvas);net.colorSpace=T.SRGBColorSpace;net.wrapS=net.wrapT=T.RepeatWrapping;
 const meshMaterial=new T.MeshStandardMaterial({map:net,alphaTest:.24,alphaToCoverage:true,side:T.DoubleSide,roughness:.62,metalness:.3});
 let fenceMeters=0;
 function fence(points:Pixel[],fenceHeight=2.6,closed=false,capped=false){
  const ring=closed?[...points,points[0]]:points;
  for(let i=1;i<ring.length;i++){
   const start=pixel(ring[i-1]),end=pixel(ring[i]),length=start.distanceTo(end),sections=Math.ceil(length/2.8);fenceMeters+=length;
   for(let j=0;j<sections;j++){
    const a2=start.clone().lerp(end,j/sections),b2=start.clone().lerp(end,(j+1)/sections);
    const a=new T.Vector3(a2.x,height(a2.x,a2.y),a2.y),b=new T.Vector3(b2.x,height(b2.x,b2.y),b2.y),topA=a.clone().add(new T.Vector3(0,fenceHeight,0)),topB=b.clone().add(new T.Vector3(0,fenceHeight,0));
    beam(a,topA,.036,steel);beam(topA,topB,capped?.06:.028,capped?yellow:steel);
    const positions=[...a.toArray(),...b.toArray(),...topA.toArray(),...topB.toArray()];
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute([0,0,a.distanceTo(b)/.4,0,0,fenceHeight/.4,a.distanceTo(b)/.4,fenceHeight/.4],2));g.setIndex([0,1,2,2,1,3]);g.computeVertexNormals();add(g,meshMaterial);
    if(j===sections-1)beam(b,topB,.036,steel);
   }
  }
 }
 // Baseball boundaries follow visible perimeter fencing; the backstop is a separate taller run.
 fence([[177,146],[451,237],[475,268],[470,300],[421,391],[382,528],[160,473],[103,429],[137,262]],2.7,true,true);
 fence([[438,234],[472,249],[484,270],[477,296]],6,false);
 fence([[1362,662],[1525,662],[1524,828],[1505,850],[1320,846],[1306,825],[1330,737]],2.5,true,true);
 fence([[1518,789],[1533,819],[1523,850],[1484,857]],5,false);
 // Dugout shelters remain deliberately small and low; the field surfaces are modeled separately in landscape.ts.
 function dugout(a:Pixel,b:Pixel){
  const p=at(a),q=at(b),center=p.clone().add(q).multiplyScalar(.5),length=p.distanceTo(q),yaw=Math.atan2(q.x-p.x,q.z-p.z),normal=new T.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  box(center.clone().add(new T.Vector3(0,.06,0)),2.7,.12,length+1,concrete,yaw);
  box(center.clone().add(new T.Vector3(0,2.35,0)),3.1,.13,length+1.2,dark,yaw);
  for(const point of [p,q])for(const side of [-1,1]){const base=point.clone().addScaledVector(normal,side*1.25);beam(base,base.clone().add(new T.Vector3(0,2.35,0)),.055,steel);}
  box(center.clone().add(new T.Vector3(0,.5,0)).addScaledVector(normal,.7),.4,.12,length-.5,white,yaw);
 }
 dugout([389,224],[425,237]);dugout([435,337],[424,371]);
 dugout([1454,849],[1485,849]);dugout([1521,744],[1521,778]);
 // Real bases sit only a few centimeters above the turf, rather than billboard symbols.
 for(const base of [[433,268],[406,338],[337,309],[363,241],[1501,827],[1449,827],[1449,775],[1501,775]] as Pixel[]){box(at(base,.035),.38,.07,.38,white);}
 // The football uprights stand just beyond the end zones of the already modeled field.
 const stadium=project({lon:-121.8239824,lat:37.2760092}),baseY=height(stadium.x,stadium.y),stadiumYaw=-.025;
 const stadiumPoint=(x:number,y:number,z:number)=>new T.Vector3(x,y,z).applyAxisAngle(new T.Vector3(0,1,0),stadiumYaw).add(new T.Vector3(stadium.x,baseY,stadium.y));
 for(const side of [-1,1]){
  beam(stadiumPoint(side*60,0,0),stadiumPoint(side*60,3.05,0),.13,yellow);
  beam(stadiumPoint(side*60,3.05,0),stadiumPoint(side*55.3,3.05,0),.12,yellow);
  beam(stadiumPoint(side*55.3,3.05,-2.82),stadiumPoint(side*55.3,3.05,2.82),.075,yellow);
  for(const z of [-2.82,2.82])beam(stadiumPoint(side*55.3,3.05,z),stadiumPoint(side*55.3,9.2,z),.065,yellow);
 }
 // Modeled practice-field goals replace the tiny goal marks in the old photo.
 for(const [center,side] of [[[1576,767],-1],[[1877,764],1]] as [Pixel,number][]){
  const p=at(center),goalPoint=(x:number,y:number,z:number)=>p.clone().add(new T.Vector3(x*side,y,z));
  for(const z of [-3.66,3.66]){
   beam(goalPoint(0,0,z),goalPoint(0,2.44,z),.055,white);
   beam(goalPoint(0,2.44,z),goalPoint(2,0,z),.04,white);
   beam(goalPoint(0,.04,z),goalPoint(2,.04,z),.035,white);
  }
  beam(goalPoint(0,2.44,-3.66),goalPoint(0,2.44,3.66),.055,white);
  beam(goalPoint(2,.04,-3.66),goalPoint(2,.04,3.66),.035,white);
  const net=new T.BufferGeometry();net.setAttribute('position',new T.Float32BufferAttribute([...goalPoint(0,2.44,-3.66).toArray(),...goalPoint(0,2.44,3.66).toArray(),...goalPoint(2,.04,-3.66).toArray(),...goalPoint(2,.04,3.66).toArray()],3));net.setAttribute('uv',new T.Float32BufferAttribute([0,0,18,0,0,7,18,7],2));net.setIndex([0,1,2,1,3,2]);net.computeVertexNormals();add(net,meshMaterial);
 }
 for(const [material,parts] of batches){const geometry=mergeGeometries(parts,false)!;const mesh=new T.Mesh(geometry,material);mesh.castShadow=material!==meshMaterial;mesh.receiveShadow=true;scene.add(mesh);parts.forEach(p=>p.dispose());}

 // Authored parked sedans: one instanced draw per material, with shared geometry and varied paint.
 // Tire bottoms are 0.04 m above the model origin. Seat them on the actual asphalt.
 const cars=parking.bays.filter(bay=>bay.occupied).map(bay=>({position:new T.Vector3(bay.center.x,terrainHeight(bay.center.x,bay.center.y)+PARKING_SURFACE_LIFT-.04,bay.center.y),yaw:bay.yaw}));
 const paint=new T.MeshStandardMaterial({color:'#ffffff',metalness:.48,roughness:.3});
 const windows=new T.MeshStandardMaterial({color:'#283e49',metalness:.65,roughness:.16});
 const rubber=new T.MeshStandardMaterial({color:'#222525',roughness:.95});
 const lamps=new T.MeshStandardMaterial({color:'#eadfc6',roughness:.28,metalness:.25});
 const rearLamps=new T.MeshStandardMaterial({color:'#82302d',roughness:.4});
 const carParts=new Map<T.Material,T.BufferGeometry[]>();
 const carPart=(g:T.BufferGeometry,m:T.Material,x=0,y=0,z=0)=>{g.translate(x,y,z);const list=carParts.get(m)||[];list.push(g.index?g.toNonIndexed():g);if(g.index)g.dispose();carParts.set(m,list);};
 carPart(new RoundedBoxGeometry(1.8,.7,4.35,2,.15),paint,0,.66,0);
 // A trapezoidal cabin gives sloping glass instead of a second rectangular box.
 const cabin=new T.BufferGeometry();cabin.setAttribute('position',new T.Float32BufferAttribute([- .82,.95,-1.25,.82,.95,-1.25,-.64,1.48,-.8,.64,1.48,-.8,-.82,.95,1.25,.82,.95,1.25,-.64,1.48,.63,.64,1.48,.63],3));cabin.setIndex([0,2,1,1,2,3,4,5,6,5,7,6,0,4,2,4,6,2,1,3,5,5,3,7,2,6,3,3,6,7]);cabin.computeVertexNormals();carPart(cabin,windows);
 carPart(new RoundedBoxGeometry(1.32,.09,1.5,1,.04),paint,0,1.5,-.08);
 for(const x of [-.87,.87])for(const z of [-1.34,1.34]){
  const tire=new T.CylinderGeometry(.3,.3,.22,12);tire.rotateZ(Math.PI/2);carPart(tire,rubber,x,.34,z);
  const hub=new T.CylinderGeometry(.18,.18,.23,10);hub.rotateZ(Math.PI/2);carPart(hub,steel,x,.34,z);
 }
 for(const x of [-.58,.58]){carPart(new T.BoxGeometry(.43,.15,.035),lamps,x,.72,2.18);carPart(new T.BoxGeometry(.43,.16,.035),rearLamps,x,.72,-2.18);}
 const dummy=new T.Object3D(),colors=['#d5d7d4','#6e7f87','#e1e0d8','#24394c','#8b3330','#50555b'];
 for(const [material,parts] of carParts){
  const geometry=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());const instances=new T.InstancedMesh(geometry,material,cars.length);
  cars.forEach((car,i)=>{dummy.position.copy(car.position);const front=car.position.clone().add(new T.Vector3(Math.sin(car.yaw)*1.5,0,Math.cos(car.yaw)*1.5)),back=car.position.clone().sub(new T.Vector3(Math.sin(car.yaw)*1.5,0,Math.cos(car.yaw)*1.5));dummy.rotation.set(-Math.atan2(height(front.x,front.z)-height(back.x,back.z),3),car.yaw,0,'YXZ');dummy.updateMatrix();instances.setMatrixAt(i,dummy.matrix);if(material===paint)instances.setColorAt(i,new T.Color(colors[i%colors.length]));});
  instances.castShadow=true;instances.receiveShadow=true;instances.computeBoundingSphere();scene.add(instances);
 }
 return {parkedCars:cars.length,fenceMeters:Math.round(fenceMeters)};
}
