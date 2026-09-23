import * as T from 'three';
import {loadTexture} from './assets';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

type Geo={lon:number;lat:number};
export function createCampusRoofMaterial(){
 const roofCanvas=document.createElement('canvas');roofCanvas.width=roofCanvas.height=256;
 const rc=roofCanvas.getContext('2d')!,roofPixels=rc.createImageData(256,256);let roofSeed=1847;
 for(let i=0;i<roofPixels.data.length;i+=4){roofSeed=(Math.imul(roofSeed,1664525)+1013904223)>>>0;const grain=(roofSeed/4294967296-.5)*12;roofPixels.data[i]=113+grain;roofPixels.data[i+1]=125+grain;roofPixels.data[i+2]=116+grain;roofPixels.data[i+3]=255;}rc.putImageData(roofPixels,0,0);
 rc.fillStyle='#3b4a44';rc.fillRect(0,0,3,256);rc.fillStyle='#a9b2a2';rc.fillRect(3,0,2,256);rc.fillStyle='#49574f77';rc.fillRect(0,0,256,1);
 const roofMap=new T.CanvasTexture(roofCanvas);roofMap.colorSpace=T.SRGBColorSpace;roofMap.wrapS=roofMap.wrapT=T.RepeatWrapping;roofMap.anisotropy=8;
 return new T.MeshStandardMaterial({map:roofMap,bumpMap:roofMap,bumpScale:.055,roughness:.57,metalness:.3});
}

/** Authored landmarks, positioned from the OSM footprint and public-domain orthophoto.
 * Facade forms reference the school's campus gallery; dimensions remain approximate.
 */
export async function buildCampus(scene:T.Scene,project:(p:Geo)=>T.Vector2,height:(x:number,z:number)=>number,roofMaterial:T.MeshStandardMaterial,stoneMap?:T.Texture){
 const groups=new Map<T.Material,T.BufferGeometry[]>();
 const material=(color:string,roughness=.75,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
 stoneMap??=await loadTexture('local-scene/stone-albedo.webp');stoneMap.colorSpace=T.SRGBColorSpace;stoneMap.wrapS=stoneMap.wrapT=T.RepeatWrapping;stoneMap.anisotropy=8;
 const cream=material('#c9c1ab'),stone=new T.MeshStandardMaterial({map:stoneMap,bumpMap:stoneMap,bumpScale:.025,roughness:.91}),white=material('#deddd1',.42,.35),dark=material('#253641',.35,.55),blue=material('#477f9d'),concrete=material('#a9a895'),turf=material('#35462a');

 const add=(g:T.BufferGeometry,m:T.Material)=>{const list=groups.get(m)||[];list.push(g.index?g.toNonIndexed():g);groups.set(m,list);};
 const box=(p:T.Vector3,w:number,h:number,d:number,m:T.Material,yaw=0)=>{const g=new T.BoxGeometry(w,h,d);if(m===stone){const positions=g.getAttribute('position'),normals=g.getAttribute('normal'),uv=g.getAttribute('uv');for(let i=0;i<positions.count;i++){const u=Math.abs(normals.getX(i))>.5?positions.getZ(i):positions.getX(i);const v=Math.abs(normals.getY(i))>.5?positions.getZ(i):positions.getY(i);uv.setXY(i,u/5,v/5);}}g.rotateY(yaw);g.translate(p.x,p.y,p.z);add(g,m);};
 const beam=(a:T.Vector3,b:T.Vector3,r:number,m:T.Material)=>{const g=new T.CylinderGeometry(r,r,a.distanceTo(b),8);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());add(g,m);};
 const frame=(lon:number,lat:number,yaw:number)=>{const p=project({lon,lat}),base=height(p.x,p.y),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw);return {base,point:(x:number,y:number,z:number)=>new T.Vector3(x,y,z).applyQuaternion(q).add(new T.Vector3(p.x,base,p.y)),yaw};};
 // The photographed conservatory wraps a glazed lobby around a right-angle corner.
 // The generic footprint has this corner removed so the stair is visible through the glass.
 const entry=frame(-121.825733,37.275996,-.237),at=(x:number,y:number,z:number)=>entry.point(x,y+99.28-entry.base,z);
 const lobbyGlass=new T.MeshPhysicalMaterial({color:'#739ba6',transparent:true,opacity:.25,roughness:.09,metalness:.06,clearcoat:.3,envMapIntensity:.65,depthWrite:false,side:T.DoubleSide});
 const canopyGlass=new T.MeshPhysicalMaterial({color:'#bbd4cf',transparent:true,opacity:.17,roughness:.18,metalness:.05,envMapIntensity:.5,depthWrite:false,side:T.DoubleSide});
 const pane=(x:number,y:number,z:number,w:number,h:number,side:'west'|'south',m:T.Material)=>{const g=new T.PlaneGeometry(w,h);g.rotateY(entry.yaw+(side==='west'?-Math.PI/2:0));g.translate(...at(x,y,z).toArray());add(g,m);};
 box(at(7.6,.02,1.25),13.4,.14,15.3,concrete,entry.yaw);
 box(at(7.6,9.85,1.25),13.6,.9,15.5,cream,entry.yaw);
 // Recessed interior finishes make the lobby read as a space behind the glazing.
 const interior=material('#77776c',.93),stairSteel=material('#404d50',.6,.35);
 box(at(14.2,4.65,1.25),.08,9.2,15.3,interior,entry.yaw);
 box(at(7.6,4.65,-6.3),13.4,9.2,.08,interior,entry.yaw);
 const lobbyLight=new T.MeshStandardMaterial({color:'#ece6cd',emissive:'#fff0c9',emissiveIntensity:.6,roughness:.7});
 for(const x of [4.2,10.8])box(at(x,9.35,1.25),.09,.035,9,lobbyLight,entry.yaw);
 // Stone head bands and solid wings frame the two glazed elevations.
 box(at(.76,9.8,1.25),.42,1.2,15.6,stone,entry.yaw);
 box(at(7.6,9.8,9.03),13.7,1.2,.42,stone,entry.yaw);
 box(at(-1.58,5.05,-11.6),.3,10.1,10.4,stone,entry.yaw);
 box(at(16.25,5.05,9.02),3.9,10.1,.3,stone,entry.yaw);
 // Three restrained horizontal openings in the otherwise solid masonry wings.
 for(const y of [2.1,5.2,8.3]){
  box(at(-1.76,y,-10.8),.06,.42,3.4,dark,entry.yaw);
  box(at(16.25,y,9.19),2.65,.42,.06,dark,entry.yaw);
  box(at(-1.8,y-.25,-10.8),.18,.08,3.55,white,entry.yaw);
  box(at(16.25,y-.25,9.23),2.8,.08,.18,white,entry.yaw);
 }
 pane(.72,4.65,1.25,15.3,9.2,'west',lobbyGlass);
 pane(7.6,4.65,9.1,13.4,9.2,'south',lobbyGlass);
 for(const y of [.12,1.1,2.4,3.5,4.7,6.9,9.2]){
  box(at(.62,y,1.25),.15,.085,15.55,white,entry.yaw);
  box(at(7.6,y,9.19),13.65,.085,.15,white,entry.yaw);
 }
 for(let i=0;i<=7;i++)box(at(.62,4.65,-6.4+i*15.3/7),.17,9.2,.1,white,entry.yaw);
 for(let i=0;i<=6;i++)box(at(.9+i*13.4/6,4.65,9.19),.1,9.2,.17,white,entry.yaw);
 // Paired glass doors, push bars and a modest interior stair supply human scale.
 for(const center of [-2,0]){box(at(.54,1.2,center),.1,2.4,.06,white,entry.yaw);beam(at(.42,1.03,center-.8),at(.42,1.03,center-.08),.025,white);}
 for(const center of [5.4,7.4]){box(at(center,1.2,9.27),.06,2.4,.1,white,entry.yaw);beam(at(center-.8,1.03,9.38),at(center-.08,1.03,9.38),.025,white);}
 box(at(11,4.45,-3.8),6.5,.2,5.1,cream,entry.yaw);
 for(let n=0;n<24;n++)box(at(10.6,.1+n*.18,6.3-n*.4),3,.18,.4,concrete,entry.yaw);
 for(const x of [9.03,12.17]){beam(at(x,-.1,6.3),at(x,4.04,-2.9),.095,stairSteel);beam(at(x,1.1,6.3),at(x,5.24,-2.9),.04,white);for(let n=0;n<24;n+=3)beam(at(x,.1+n*.18,6.3-n*.4),at(x,1.1+n*.18,6.3-n*.4),.023,white);}
 beam(at(7.8,5.5,-1.2),at(14.1,5.5,-1.2),.04,white);
 for(let x=7.8;x<14.2;x+=1.05)beam(at(x,4.55,-1.2),at(x,5.5,-1.2),.024,white);
 // Translucent canopy, thin grid framing and outward-raking perimeter columns.
 const canopy=new T.PlaneGeometry(24,24);canopy.rotateX(-Math.PI/2);canopy.rotateY(entry.yaw);canopy.translate(...at(7.5,11.5,2.5).toArray());add(canopy,canopyGlass);
 for(let n=0;n<=10;n++){
  const width=n===0||n===10?.13:.055;
  box(at(7.5,11.43,-9.5+n*2.4),24,.12,width,white,entry.yaw);
  box(at(-4.5+n*2.4,11.43,2.5),width,.12,24,white,entry.yaw);
 }
 for(const [x,z] of [[-3.6,-8.6],[-3.6,2.4],[-3.6,13.6],[7.7,13.6],[18.6,13.6]]){
  beam(at(x+(x<0?-1.8:0),.11,z+(z>10?1.2:0)),at(x,11.43,z),.12,white);
 }
 box(at(4.5,.04,2),34,.14,34,concrete,entry.yaw);
 // Large, clean hipped roof planes follow the orthophoto, using lidar for elevation only.
 const schoolRoof=roofMaterial,schoolRoofEdge=material('#535f56',.65,.3);
 function hipRoof(lon:number,lat:number,width:number,depth:number,eave:number,rise:number){
  const f=frame(lon,lat,-.237),point=(x:number,y:number,z:number)=>f.point(x,y-f.base,z),ridge=Math.max(0,width/2-depth/2);
  const vertices=[point(-width/2,eave,-depth/2),point(width/2,eave,-depth/2),point(width/2,eave,depth/2),point(-width/2,eave,depth/2),point(-ridge,eave+rise,0),point(ridge,eave+rise,0)];
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices.flatMap(p=>p.toArray()),3));geometry.setAttribute('uv',new T.Float32BufferAttribute([[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2],[-ridge,0],[ridge,0]].flatMap(([x,z])=>[x/1.2,z/4]),2));geometry.setIndex([0,4,1,1,4,5,1,5,2,2,5,3,3,5,4,3,4,0]);const plain=geometry.toNonIndexed();plain.computeVertexNormals();geometry.dispose();add(plain,schoolRoof);
  for(let i=0;i<4;i++)beam(vertices[i],vertices[(i+1)%4],.065,schoolRoofEdge);beam(vertices[4],vertices[5],.09,schoolRoofEdge);
 }
 hipRoof(-121.82685,37.276395,85,15,106.12,5.3);
 hipRoof(-121.826885,37.275873,45,26,106.62,5.8);
 hipRoof(-121.826429,37.275738,25,20,106.62,5.2);
 // Quad cross, low planters and the deep shade of the education-building veranda.
 const quad=frame(-121.826054,37.276024,-.237),qp=quad.point;
 beam(qp(0,0,0),qp(0,14.5,0),.16,white);beam(qp(-3.5,11,0),qp(3.5,11,0),.13,white);
 // Clipped shrubs keep a rectangular envelope but have individual leaves at their edges.
 // One shared alpha-tested material batches both hedges into a single draw.
 const leafCanvas=document.createElement('canvas');leafCanvas.width=leafCanvas.height=128;
 const lc=leafCanvas.getContext('2d')!;
 for(const [x,y,angle] of [[38,42,-.5],[88,45,.5],[63,90,0]]){
  lc.save();lc.translate(x,y);lc.rotate(angle);const green=lc.createLinearGradient(-17,0,17,0);green.addColorStop(0,'#52734a');green.addColorStop(.5,'#91a86a');green.addColorStop(1,'#3e633e');lc.fillStyle=green;lc.beginPath();lc.ellipse(0,0,17,29,0,0,Math.PI*2);lc.fill();lc.strokeStyle='#a5b778';lc.lineWidth=1.5;lc.beginPath();lc.moveTo(0,-23);lc.lineTo(0,24);lc.stroke();lc.restore();
 }
 const hedgeMap=new T.CanvasTexture(leafCanvas);hedgeMap.colorSpace=T.SRGBColorSpace;hedgeMap.anisotropy=8;
 const hedgeMat=new T.MeshStandardMaterial({map:hedgeMap,alphaTest:.45,side:T.DoubleSide,roughness:.92,vertexColors:true});
 let hedgeSeed=724;const hedgeRandom=()=>{hedgeSeed=(Math.imul(hedgeSeed,1664525)+1013904223)>>>0;return hedgeSeed/4294967296;};
 for(const z of [-6,6]){
  box(qp(0,.45,z),9,.9,1.8,concrete,quad.yaw);box(qp(0,1.14,z),8.4,.6,1.22,turf,quad.yaw);
  for(let i=0;i<1500;i++){
   let x=(hedgeRandom()-.5)*8.6,y=.83+hedgeRandom()*.7,dz=(hedgeRandom()-.5)*1.45;
   const face=hedgeRandom();if(face<.46)y=1.5+(hedgeRandom()-.5)*.09;else if(face<.94)dz=(hedgeRandom()<.5?-1:1)*.7;else x=(hedgeRandom()<.5?-1:1)*4.25;
   const leaf=new T.PlaneGeometry(.17+hedgeRandom()*.12,.17+hedgeRandom()*.12);leaf.rotateX(hedgeRandom()*Math.PI);leaf.rotateY(hedgeRandom()*Math.PI);leaf.rotateZ(hedgeRandom()*Math.PI);leaf.translate(...qp(x,y,z+dz).toArray());
   const shade=.7+hedgeRandom()*.3;leaf.setAttribute('color',new T.Float32BufferAttribute(Array.from({length:4},()=>[shade*.91,shade,shade*.83]).flat(),3));add(leaf,hedgeMat);
  }
 }
 // The photographed quad is a level terrace; give its concrete slabs their own surface.
 const plazaCanvas=document.createElement('canvas');plazaCanvas.width=plazaCanvas.height=1024;
 const pc=plazaCanvas.getContext('2d')!,pixels=pc.createImageData(1024,1024);let plazaSeed=9382;
 const plazaRandom=()=>{plazaSeed=(Math.imul(plazaSeed,1664525)+1013904223)>>>0;return plazaSeed/4294967296;};
 const slabShades=Array.from({length:16},()=>plazaRandom()*12-6);
 for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){
  const i=(y*1024+x)*4,shade=slabShades[Math.floor(y/256)*4+Math.floor(x/256)];
  const grain=(plazaRandom()-.5)*15,edge=Math.min(x%256,255-x%256,y%256,255-y%256);
  const aging=4*Math.exp(-edge/9),tone=shade+grain-aging;
  pixels.data[i]=173+tone;pixels.data[i+1]=172+tone;pixels.data[i+2]=160+tone;pixels.data[i+3]=255;
 }
 pc.putImageData(pixels,0,0);pc.strokeStyle='#666d6680';pc.lineWidth=1.2;
 for(let i=0;i<4;i++){pc.beginPath();pc.moveTo(i*256+.6,0);pc.lineTo(i*256+.6,1024);pc.moveTo(0,i*256+.6);pc.lineTo(1024,i*256+.6);pc.stroke();}
 const plazaMap=new T.CanvasTexture(plazaCanvas);plazaMap.colorSpace=T.SRGBColorSpace;plazaMap.wrapS=plazaMap.wrapT=T.RepeatWrapping;plazaMap.anisotropy=8;
 const plazaMat=new T.MeshStandardMaterial({map:plazaMap,bumpMap:plazaMap,bumpScale:.025,roughness:.94});
 const plazaRing=[[830,417],[967,430],[962,524],[818,504]].map(([x,y])=>project({lon:-121.8294+x/2048*.0078,lat:37.2774-y/1200*.0036}));
 const plaza=new T.ShapeGeometry(new T.Shape(plazaRing.map(p=>new T.Vector2(p.x,-p.y))));plaza.rotateX(-Math.PI/2);plaza.translate(0,99.28,0);const plazaPositions=plaza.getAttribute('position'),plazaUV=plaza.getAttribute('uv');for(let i=0;i<plazaPositions.count;i++)plazaUV.setXY(i,plazaPositions.getX(i)/9.6,plazaPositions.getZ(i)/9.6);add(plaza,plazaMat);
 // Quad landmark from the school reference: blank stucco tower, diamond frieze,
 // green hipped veranda roof and open columns. Footprint and proportions are inferred.
 const tower=frame(-121.82620,37.276257,-.237),tp=tower.point,towerHeight=113.6-tower.base;
 const warmStucco=material('#c9c1a8'),frieze=material('#a49b80'),roofMetal=material('#4d6762',.53,.32),roofTrim=material('#284e4e',.46,.4);
 box(tp(0,towerHeight/2,0),10.8,towerHeight,13.8,warmStucco,tower.yaw);
 box(tp(0,towerHeight+.12,0),11.15,.25,14.15,cream,tower.yaw);
 for(const z of [-5.1,-1.7,1.7,5.1]){
  const diamond=new T.PlaneGeometry(2.45,2.45);diamond.rotateZ(Math.PI/4);diamond.rotateY(Math.PI/2+tower.yaw);diamond.translate(...tp(5.43,towerHeight-4.7,z).toArray());add(diamond,frieze);
 }
 for(const x of [-3.4,0,3.4]){
  const diamond=new T.PlaneGeometry(2.45,2.45);diamond.rotateZ(Math.PI/4);diamond.rotateY(tower.yaw);diamond.translate(...tp(x,towerHeight-4.7,6.93).toArray());add(diamond,frieze);
 }
 const verandaLift=quad.base-tower.base,vp=(x:number,y:number,z:number)=>tp(x,y+verandaLift,z);
 box(tp(16,verandaLift/2,0),20,verandaLift,27,warmStucco,tower.yaw);
 box(vp(16,.05,0),20,.15,27,concrete,tower.yaw);
 // Six roof triangles share a straight ridge; tiles are expressed by narrow standing seams.
 const roofPoints=[[5,3.6,-13],[25,3.6,-13],[25,3.6,13],[5,3.6,13],[15,6.7,-7],[15,6.7,7]].map(p=>vp(p[0],p[1],p[2]));
 const roofGeometry=new T.BufferGeometry();roofGeometry.setAttribute('position',new T.Float32BufferAttribute(roofPoints.flatMap(p=>p.toArray()),3));roofGeometry.setIndex([0,4,1,1,4,5,1,5,2,2,5,3,3,5,4,3,4,0]);roofGeometry.computeVertexNormals();add(roofGeometry,roofMetal);
 for(let i=0;i<4;i++)beam(roofPoints[i],roofPoints[(i+1)%4],.09,roofTrim);
 beam(vp(15,6.73,-7),vp(15,6.73,7),.07,roofTrim);
 for(let z=-6.5;z<=6.5;z+=.6){beam(vp(5,3.65,z),vp(15,6.75,z),.012,roofTrim);beam(vp(15,6.75,z),vp(25,3.65,z),.012,roofTrim);}
 for(let z=-12;z<=12;z+=4){box(vp(24,1.75,z),.4,3.5,.4,warmStucco,tower.yaw);box(vp(24,.18,z),.7,.36,.7,concrete,tower.yaw);}
 for(const z of [-12,12])for(const x of [8,16])box(vp(x,1.75,z),.4,3.5,.4,warmStucco,tower.yaw);
 box(vp(24,3.35,0),.42,.36,25.2,warmStucco,tower.yaw);
 // Illustrative furniture gives the entrances and quad a readable human scale.
 const woodCanvas=document.createElement('canvas');woodCanvas.width=256;woodCanvas.height=64;
 const wc=woodCanvas.getContext('2d')!;wc.fillStyle='#a9845c';wc.fillRect(0,0,256,64);
 for(let y=0;y<64;y++){wc.strokeStyle=y%3?'#66503828':'#dec49a35';wc.lineWidth=.5+(y%4)*.25;wc.beginPath();for(let x=0;x<=256;x+=8){const py=y+Math.sin(x*.035+y*1.7)*.6;x?wc.lineTo(x,py):wc.moveTo(x,py);}wc.stroke();}
 const woodMap=new T.CanvasTexture(woodCanvas);woodMap.colorSpace=T.SRGBColorSpace;woodMap.anisotropy=8;
 const wood=new T.MeshStandardMaterial({map:woodMap,roughness:.84});
 const furniturePoint=(base:T.Vector3,yaw:number)=>(x:number,y:number,z:number)=>new T.Vector3(x,y,z).applyAxisAngle(new T.Vector3(0,1,0),yaw).add(base);
 function bench(base:T.Vector3,yaw:number){
  const p=furniturePoint(base,yaw);
  for(let slat=0;slat<5;slat++)box(p(0,.48,-.22+slat*.11),1.9,.075,.092,wood,yaw);
  for(let slat=0;slat<4;slat++)box(p(0,.67+slat*.11,.3),1.9,.088,.06,wood,yaw);
  for(const x of [-.71,.71]){
   for(const z of [-.19,.19])box(p(x,.23,z),.075,.46,.075,dark,yaw);
   box(p(x,.43,0),.085,.085,.55,dark,yaw);box(p(x,.72,.32),.065,.66,.065,dark,yaw);
   box(p(x,1.065,.31),.09,.045,.09,white,yaw);
  }
  for(const x of [-.91,.91]){box(p(x,.62,-.15),.055,.28,.055,dark,yaw);box(p(x,.76,.06),.065,.05,.53,dark,yaw);}
 }
 // Quad seats stand on the modeled level slab, beyond the ends of each planter.
 for(const z of [-6,6])for(const x of [-6.5,6.5]){const p=qp(x,0,z);p.y=99.28;bench(p,quad.yaw+(x<0?Math.PI/2:-Math.PI/2));}
 for(const z of [-9,9])bench(vp(18,.125,z),tower.yaw+(z<0?Math.PI:0));
 for(const z of [-10,10])bench(at(-3,.11,z),entry.yaw-Math.PI/2);
 // Open-top paired bins, with a recessed dark opening and a narrow metal rim.
 const recycle=material('#345763',.72,.15);
 function bin(base:T.Vector3,m:T.Material){
  const shell=new T.CylinderGeometry(.29,.255,.82,12,1,true);shell.translate(base.x,base.y+.41,base.z);add(shell,m);
  const rim=new T.RingGeometry(.205,.305,16);rim.rotateX(-Math.PI/2);rim.translate(base.x,base.y+.84,base.z);add(rim,dark);
  const opening=new T.CircleGeometry(.205,16);opening.rotateX(-Math.PI/2);opening.translate(base.x,base.y+.78,base.z);add(opening,dark);
  for(let n=0;n<12;n++){const a=n/12*Math.PI*2;beam(base.clone().add(new T.Vector3(Math.cos(a)*.275,.08,Math.sin(a)*.275)),base.clone().add(new T.Vector3(Math.cos(a)*.29,.8,Math.sin(a)*.29)),.008,dark);}
 }
 for(const x of [-.38,.38]){const p=qp(-6.5+x,0,9);p.y=99.28;bin(p,x<0?dark:recycle);bin(at(-8+x,.11,-11),x<0?dark:recycle);}
 // Five inverted-U bicycle stands on the entrance apron, clear of the paired doors.
 for(let n=0;n<5;n++){
  const z=7.5+n*.95;beam(at(-8,.11,z),at(-8,.91,z),.027,dark);beam(at(-7.3,.11,z),at(-7.3,.91,z),.027,dark);
  beam(at(-8,.91,z),at(-7.3,.91,z),.027,dark);
  for(const x of [-8,-7.3])box(at(x,.13,z),.13,.04,.13,dark,entry.yaw);
 }
 // Football stadium: competition markings and blue track, modeled bleacher tiers, rails and lighting.
 const stadium=frame(-121.8239824,37.2760092,-.025),sp=stadium.point;
 const trackShape=new T.Shape();const radius=38,straight=46;
 trackShape.moveTo(-straight,-radius);trackShape.lineTo(straight,-radius);trackShape.absarc(straight,0,radius,-Math.PI/2,Math.PI/2,false);trackShape.lineTo(-straight,radius);trackShape.absarc(-straight,0,radius,Math.PI/2,Math.PI*1.5,false);
 const track=new T.ShapeGeometry(trackShape,48);track.rotateX(-Math.PI/2);track.rotateY(stadium.yaw);track.translate(...sp(0,.12,0).toArray());add(track,blue);
 const fieldCanvas=document.createElement('canvas');fieldCanvas.width=1536;fieldCanvas.height=768;const ctx=fieldCanvas.getContext('2d')!;
 ctx.fillStyle='#426735';ctx.fillRect(0,0,1536,768);
 for(let x=128;x<1408;x+=64){ctx.fillStyle=Math.round((x-128)/64)%2?'#527744':'#4a6d3d';ctx.fillRect(x,18,64,732);}
 ctx.fillStyle='#203d58';ctx.fillRect(16,18,112,732);ctx.fillRect(1408,18,112,732);ctx.strokeStyle='#e0ded0';ctx.lineWidth=3;ctx.strokeRect(16,18,1504,732);
 for(let i=0;i<=20;i++){const x=128+i*64;ctx.lineWidth=i%2?2:3;ctx.beginPath();ctx.moveTo(x,18);ctx.lineTo(x,750);ctx.stroke();}
 ctx.font='bold 28px sans-serif';ctx.textAlign='center';ctx.fillStyle='#dedccc';
 for(let i=1;i<10;i++){const x=128+i*128;ctx.fillText(String(Math.min(i,10-i)*10),x,135);ctx.save();ctx.translate(x,630);ctx.rotate(Math.PI);ctx.fillText(String(Math.min(i,10-i)*10),0,0);ctx.restore();}
 for(let i=1;i<100;i++){const x=128+i*12.8;for(const y of [20,282,478,735])ctx.fillRect(x,y,2,12);}
 ctx.font='bold 58px sans-serif';for(const x of [74,1462]){ctx.save();ctx.translate(x,384);ctx.rotate(-Math.PI/2);ctx.fillText('WARRIORS',0,19);ctx.restore();}
 ctx.font='bold 88px Georgia';ctx.fillStyle='#183957';ctx.fillText('VC',768,405);
 const fieldTex=new T.CanvasTexture(fieldCanvas);fieldTex.colorSpace=T.SRGBColorSpace;fieldTex.anisotropy=8;const fieldMat=new T.MeshStandardMaterial({map:fieldTex,roughness:1});
 const field=new T.PlaneGeometry(109.7,48.8);field.rotateX(-Math.PI/2);field.rotateY(stadium.yaw);field.translate(...sp(0,.16,0).toArray());add(field,fieldMat);
 // Lane markings follow the same stadium oval, outside the infield.
 for(let lane=0;lane<7;lane++){const r=29.4+lane*1.15,points:T.Vector3[]=[];for(let i=0;i<=160;i++){const angle=i/160*Math.PI*2;points.push(sp((Math.cos(angle)>=0?straight:-straight)+Math.cos(angle)*r,.175,-Math.sin(angle)*r));}const g=new T.BufferGeometry().setFromPoints(points);const line=new T.LineLoop(g,new T.LineBasicMaterial({color:'#aec3c7',transparent:true,opacity:.7}));scene.add(line);}
 for(const side of [-1,1]){const rows=side===1?11:5;for(let row=0;row<rows;row++){const z=side*(39+row*.8),y=.35+row*.43;box(sp(0,y,z),side===1?85:66,.22,.75,white,stadium.yaw);}for(let x=-40;x<=40;x+=10){beam(sp(x,0,39),sp(x,5.5,48),.075,white);beam(sp(x,5.5,48),sp(x,6.5,48),.045,white);}beam(sp(-43,6.5,48),sp(43,6.5,48),.055,white);}
 for(const x of [-73,73])for(const z of [-35,35]){beam(sp(x,0,z),sp(x,25,z),.19,white);box(sp(x,25,z),5,.35,.4,dark,stadium.yaw);for(let lamp=-2;lamp<=2;lamp++)box(sp(x+lamp,25.1,z-.22),.65,.55,.25,white,stadium.yaw);}
 box(sp(-70,7,0),.5,6,12,dark,stadium.yaw);for(const z of [-4,4])beam(sp(-70,0,z),sp(-70,5,z),.16,white);
 const boardCanvas=document.createElement('canvas');boardCanvas.width=512;boardCanvas.height=256;const bc=boardCanvas.getContext('2d')!;bc.fillStyle='#122b40';bc.fillRect(0,0,512,256);bc.fillStyle='#e2dfca';bc.textAlign='center';bc.font='bold 42px sans-serif';bc.fillText('WARRIORS',256,62);bc.font='bold 96px Georgia';bc.fillText('VC',256,165);bc.font='16px sans-serif';bc.fillText('VALLEY CHRISTIAN',256,222);const boardTex=new T.CanvasTexture(boardCanvas);boardTex.colorSpace=T.SRGBColorSpace;const boardMat=new T.MeshStandardMaterial({map:boardTex,roughness:.8});const board=new T.PlaneGeometry(12,6);board.rotateY(Math.PI/2+stadium.yaw);board.translate(...sp(-69.72,7,0).toArray());add(board,boardMat);
 // Competition pool: deep turquoise water, lane ropes, pale coping and deck rails.
 const pool=frame(-121.827515,37.275946,-.237),pp=pool.point;
 box(pp(0,.03,0),55,.15,29,concrete,pool.yaw);
 const waterCanvas=document.createElement('canvas');waterCanvas.width=1024;waterCanvas.height=512;const wctx=waterCanvas.getContext('2d')!;
 wctx.fillStyle='#087a98';wctx.fillRect(0,0,1024,512);
 for(let i=0;i<100;i++){wctx.strokeStyle=`rgba(95,219,220,${.035+(i%7)*.008})`;wctx.lineWidth=1+(i%3);wctx.beginPath();for(let x=0;x<=1024;x+=4){const y=i*5.2+Math.sin(x*.052+i)*2+Math.sin(x*.091+i*3)*1.5;x?wctx.lineTo(x,y):wctx.moveTo(x,y);}wctx.stroke();}
 for(let lane=0;lane<10;lane++){const y=(lane+.5)*51.2;wctx.fillStyle='#114654';wctx.fillRect(34,y-2,956,4);wctx.fillRect(55,y-14,4,28);wctx.fillRect(965,y-14,4,28);}
 const waterTex=new T.CanvasTexture(waterCanvas);waterTex.colorSpace=T.SRGBColorSpace;waterTex.anisotropy=8;const waterMat=new T.MeshPhysicalMaterial({map:waterTex,roughness:.18,metalness:.25,clearcoat:1,clearcoatRoughness:.1});
 const water=new T.PlaneGeometry(50,25);water.rotateX(-Math.PI/2);water.rotateY(pool.yaw);water.translate(...pp(0,.14,0).toArray());add(water,waterMat);
 for(const z of [-12.8,12.8])box(pp(0,.18,z),51,.24,.45,white,pool.yaw);
 for(let lane=0;lane<=10;lane++){const z=-12.5+lane*2.5;beam(pp(-25,.21,z),pp(25,.21,z),.055,lane%2?blue:white);}
 for(let lane=0;lane<10;lane++)box(pp(25.8,.5,-11.25+lane*2.5),.8,.7,.65,white,pool.yaw);
 for(const z of [-15,15]){beam(pp(-28,1.1,z),pp(28,1.1,z),.035,white);for(let x=-28;x<=28;x+=4)beam(pp(x,0,z),pp(x,1.1,z),.035,white);}
 for(const [m,geometries] of groups){const merged=mergeGeometries(geometries,false);if(merged){const mesh=new T.Mesh(merged,m);mesh.castShadow=m!==waterMat&&m!==fieldMat&&m!==lobbyGlass&&m!==canopyGlass;mesh.receiveShadow=true;scene.add(mesh);}geometries.forEach(g=>g.dispose());}
 return {landmarks:3};
}
