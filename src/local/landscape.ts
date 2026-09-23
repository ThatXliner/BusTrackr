import * as T from 'three';
import {PARKING_SURFACE_LIFT,type ParkingLayout} from './parking';
import {conformTriangle,type TerrainGrid} from './terrain-conform';

export type LandscapeData={boundary:[number,number][][][];roads:{id:number;kind:'road'|'path';width:number;points:[number,number][]}[];areas:{id:number;kind:'lawn'|'gravel';ring:[number,number][]}[];trees:[number,number,number][]};
type Point=readonly [number,number];

// Authored surfaces follow the rendered terrain triangles, so pavement cannot sink
// into a hill between its vertices. Materials tile in meters, never in map pixels.
export function buildLandscape(scene:T.Scene,height:(x:number,z:number)=>number,grid:TerrainGrid,inside:(x:number,z:number)=>boolean,data:LandscapeData,project:(p:{lon:number;lat:number})=>T.Vector2,parking:ParkingLayout){
 let seed=52391;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const context=canvas.getContext('2d')!,pixels=context.createImageData(256,256);
 for(let i=0;i<pixels.data.length;i+=4){const grain=210+random()*45;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=grain;pixels.data[i+3]=255;}context.putImageData(pixels,0,0);
 const grain=new T.CanvasTexture(canvas);grain.colorSpace=T.SRGBColorSpace;grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.anisotropy=4;
 const material=(color:string,bump=.016)=>new T.MeshStandardMaterial({color,map:grain,bumpMap:grain,bumpScale:bump,roughness:.96});
 const mats={asphalt:material('#555959'),concrete:material('#bab7aa'),soil:material('#9d7350',.04),lawn:material('#77865b',.025),turf:material('#486a44',.012),turfLight:material('#54764c',.012),gravel:material('#a19881',.035),court:material('#557d8b'),white:material('#e2dfcf',0)};
 // Explicit depth layers prevent distant coplanar turf/paint from flickering.
 for(const [name,depth] of Object.entries({lawn:1,gravel:1,asphalt:3,concrete:3,turf:4,soil:5,turfLight:6,court:4,white:8})){
  const m=mats[name as keyof typeof mats];m.polygonOffset=true;m.polygonOffsetFactor=0;m.polygonOffsetUnits=-depth;
 }
 const clearings=new Map<string,T.Vector2[][]>();
 const inRing=(x:number,z:number,ring:T.Vector2[])=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>z)!==(b.y>z)&&x<(b.x-a.x)*(z-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;};
 const batches=new Map<T.Material,number[]>();let patches=0;
 const emit=(a:T.Vector3,b:T.Vector3,c:T.Vector3,m:T.Material)=>{
  const x=(a.x+b.x+c.x)/3,z=(a.z+b.z+c.z)/3;
  if(!inside(x,z)||![a,b,c].every(p=>inside(p.x,p.z)))return;
  let p=batches.get(m);if(!p){p=[];batches.set(m,p);}
  if(b.clone().sub(a).cross(c.clone().sub(a)).y<0)[b,c]=[c,b];
  p.push(...a.toArray(),...b.toArray(),...c.toArray());
 };
 function clip(ring:T.Vector2[]){
  for(const [axis,bound,sign] of [['x',grid.minX,1],['x',grid.minX+grid.stepX*grid.columns,-1],['y',grid.minZ,1],['y',grid.minZ+grid.stepZ*grid.rows,-1]] as const){
   const next:T.Vector2[]=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],da=(a[axis]-bound)*sign,db=(b[axis]-bound)*sign;if(da>=0)next.push(a);if((da>=0)!==(db>=0))next.push(a.clone().lerp(b,da/(da-db)));}ring=next;
  }return ring;
 }
 function patch(points:readonly Point[]|T.Vector2[],m:T.Material,lift=.04,holes:T.Vector2[][]=[]){
  const ring=clip(points.map(p=>p instanceof T.Vector2?p:new T.Vector2(...p)));if(ring.length<3)return;
  if(m!==mats.white){const minX=Math.floor(Math.min(...ring.map(p=>p.x))/32),maxX=Math.floor(Math.max(...ring.map(p=>p.x))/32),minZ=Math.floor(Math.min(...ring.map(p=>p.y))/32),maxZ=Math.floor(Math.max(...ring.map(p=>p.y))/32);for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){const key=`${x},${z}`,list=clearings.get(key)||[];list.push(ring);clearings.set(key,list);}}
  const vertices=[...ring,...holes.flat()],faces=T.ShapeUtils.triangulateShape(ring,holes);
  for(const face of faces){const [a,b,c]=face.map(i=>new T.Vector3(vertices[i].x,height(vertices[i].x,vertices[i].y)+lift,vertices[i].y));conformTriangle(a,b,c,grid,height,(a,b,c)=>emit(a,b,c,m));}patches++;
 }
 function strip(a:T.Vector2,b:T.Vector2,width:number,m:T.Material,lift=.08){const n=b.clone().sub(a);if(n.length()<.01)return;n.normalize().set(-n.y,n.x).multiplyScalar(width/2);patch([a.clone().add(n),b.clone().add(n),b.clone().sub(n),a.clone().sub(n)],m,lift);}
 const pixel=([x,y]:Point)=>project({lon:-121.8294+x/2048*.0078,lat:37.2774-y/1200*.0036});
 const campus=(points:readonly Point[],m:T.Material,lift=.08)=>patch(points.map(pixel),m,lift);
 const circle=(center:T.Vector2,radius:number,m:T.Material,lift:number)=>patch(Array.from({length:40},(_,i)=>center.clone().add(new T.Vector2(Math.cos(i/40*Math.PI*2),Math.sin(i/40*Math.PI*2)).multiplyScalar(radius))),m,lift);
 for(const area of data.areas)patch(area.ring as Point[],mats[area.kind],.025);
 // Side streets and service paths replace the roads formerly visible only in imagery.
 for(const road of data.roads)for(let i=1;i<road.points.length;i++)strip(new T.Vector2(...road.points[i-1] as [number,number]),new T.Vector2(...road.points[i] as [number,number]),road.width,road.kind==='path'?mats.concrete:mats.asphalt,road.kind==='path'?.1:.07);
 // Campus terraces, pool deck, entrance walks and service aprons.
 for(const ring of [
  [[477,348],[548,361],[909,432],[967,430],[974,524],[840,527],[818,504],[584,452]],
  [[968,490],[1138,521],[1169,552],[1183,621],[1090,623],[1015,571],[970,559]],
  [[1162,557],[1635,561],[1650,634],[1169,638]],
 ] as Point[][])campus(ring,mats.concrete,.055);
 // Leave a real opening for the separately modeled pool and coping. A solid
 // terrain-following deck would cover its level water surface on the hillside.
 const pool=project({lon:-121.827515,lat:37.275946}),yaw=-.237;
 const poolHole=[[-27.8,-14.8],[-27.8,14.8],[27.8,14.8],[27.8,-14.8]].map(([x,z])=>new T.Vector2(pool.x+Math.cos(yaw)*x+Math.sin(yaw)*z,pool.y-Math.sin(yaw)*x+Math.cos(yaw)*z));
 patch([[393,405],[430,402],[612,448],[588,568],[389,521]].map(p=>pixel(p as [number,number])),mats.concrete,.055,[poolHole]);
 // Paved lots are explicit surfaces; cars and painted bays sit above them.
 parking.lots.forEach(ring=>patch(ring,mats.asphalt,PARKING_SURFACE_LIFT));
 for(const bay of parking.bays)for(let edge=0;edge<4;edge++)strip(bay.corners[edge],bay.corners[(edge+1)%4],.1,mats.white,.11);
 // A modest authored Fehren boarding apron, sized to the route endpoint.
 const fehren=project({lon:-121.8410603,lat:37.2843319});
 patch([[-31,-34],[31,-34],[31,12],[-31,12]].map(([x,z])=>fehren.clone().add(new T.Vector2(x,z))),mats.asphalt,.08);
 for(let i=-25;i<=25;i+=2.8)strip(fehren.clone().add(new T.Vector2(i,-32)),fehren.clone().add(new T.Vector2(i,-27)),.1,mats.white,.11);
 // Baseball turf, dirt fans, infield grass, foul lines and pitcher's mound.
 function baseball(boundary:Point[],bases:Point[],radius:number){
  campus(boundary,mats.turf,.075);
  const [home,first,second,third]=bases.map(pixel);
  const a=Math.atan2(first.y-home.y,first.x-home.x);let b=Math.atan2(third.y-home.y,third.x-home.x);while(b<a)b+=Math.PI*2;
  const fan=[home,...Array.from({length:33},(_,i)=>home.clone().add(new T.Vector2(Math.cos(a+(b-a)*i/32),Math.sin(a+(b-a)*i/32)).multiplyScalar(radius)))];patch(fan,mats.soil,.095);
  const center=home.clone().lerp(second,.5);patch([home,first,second,third].map(p=>p.clone().lerp(center,.17)),mats.turfLight,.115);
  for(const [p,q] of [[home,first],[first,second],[second,third],[third,home]])strip(p,q,1.1,mats.soil,.125);
  for(const p of [first,third])strip(home,home.clone().add(p.clone().sub(home).normalize().multiplyScalar(radius*1.65)),.1,mats.white,.145);
  circle(home,.95,mats.soil,.15);circle(home.clone().lerp(second,.53),1.4,mats.soil,.15);
 }
 baseball([[177,146],[451,237],[475,268],[470,300],[421,391],[382,528],[160,473],[103,429],[137,262]],[[433,268],[406,338],[337,309],[363,241]],35);
 baseball([[1362,662],[1525,662],[1524,828],[1505,850],[1320,846],[1306,825],[1330,737]],[[1501,827],[1449,827],[1449,775],[1501,775]],26);
 // Lower practice field: alternating mowing strips, touchlines, boxes and center circle.
 const field=[[1575,678],[1876,675],[1878,853],[1577,856]].map(p=>pixel(p as [number,number]));
 const fieldPoint=(u:number,v:number)=>field[0].clone().lerp(field[1],u).lerp(field[3].clone().lerp(field[2],u),v);
 for(let i=0;i<12;i++)patch([fieldPoint(i/12,0),fieldPoint((i+1)/12,0),fieldPoint((i+1)/12,1),fieldPoint(i/12,1)],i%2?mats.turf:mats.turfLight,.08);
 const fieldLine=(a:Point,b:Point)=>strip(fieldPoint(...a),fieldPoint(...b),.11,mats.white,.12);
 for(const [a,b] of [[[0,0],[1,0]],[[1,0],[1,1]],[[1,1],[0,1]],[[0,1],[0,0]],[[.5,0],[.5,1]]] as [Point,Point][])fieldLine(a,b);
 for(const side of [0,1]){const x=side===0?.16:.84;fieldLine([side,.2],[x,.2]);fieldLine([x,.2],[x,.8]);fieldLine([x,.8],[side,.8]);}
 const center=fieldPoint(.5,.5);for(let i=0;i<64;i++)strip(center.clone().add(new T.Vector2(Math.cos(i/64*Math.PI*2),Math.sin(i/64*Math.PI*2)).multiplyScalar(9.15)),center.clone().add(new T.Vector2(Math.cos((i+1)/64*Math.PI*2),Math.sin((i+1)/64*Math.PI*2)).multiplyScalar(9.15)),.1,mats.white,.12);
 // Tennis court pads and line work, independently of the old aerial ground.
 for(const corners of [[[1185,182],[1248,151],[1263,181],[1200,212]],[[1284,135],[1347,104],[1362,134],[1299,165]],[[1400,158],[1417,129],[1477,166],[1459,194]],[[1492,214],[1509,186],[1569,222],[1551,251]]] as Point[][]){
  const ring=corners.map(pixel),c=ring.reduce((a,p)=>a.add(p),new T.Vector2()).multiplyScalar(.25);patch(ring.map(p=>p.clone().lerp(c,-.15)),mats.court,.08);for(let i=0;i<4;i++)strip(ring[i],ring[(i+1)%4],.08,mats.white,.12);strip(ring[0].clone().lerp(ring[1],.5),ring[3].clone().lerp(ring[2],.5),.09,mats.white,.12);
 }
 for(const [material,positions] of batches){const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));const uvs:number[]=[];for(let i=0;i<positions.length;i+=3)uvs.push(positions[i]/4,positions[i+2]/4);geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();const mesh=new T.Mesh(geometry,material);mesh.receiveShadow=true;scene.add(mesh);}
 return {patches,drawCalls:batches.size,naturalAt(x:number,z:number){return inside(x,z)&&!(clearings.get(`${Math.floor(x/32)},${Math.floor(z/32)}`)||[]).some(ring=>inRing(x,z,ring));}};
}
