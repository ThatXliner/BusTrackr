import * as T from 'three';
import type {LandscapeData} from './landscape';

export const PARKING_SURFACE_LIFT=.085;

type Pixel=readonly [number,number];
export type ParkingBay={row:number;slot:number;center:T.Vector2;yaw:number;corners:T.Vector2[];occupied:boolean};
export type ParkingLayout={lots:T.Vector2[][];bays:ParkingBay[]};
const LOTS:Pixel[][]=[
 [[839,566],[954,571],[1138,620],[1164,681],[1114,707],[943,649],[861,633]],
 [[1171,663],[1240,670],[1358,695],[1308,830],[1161,767],[1117,723]],
 [[1518,872],[1731,875],[1742,927],[1532,923]],
 [[226,568],[286,581],[333,642],[403,655],[426,698],[367,731],[275,690],[229,644]],
];
const ROWS:{lot:number;start:Pixel;end:Pixel;spacing:number;side:number}[]=[
 {lot:0,start:[877,586],end:[1092,628],spacing:2.8,side:1},
 {lot:0,start:[965,634],end:[1116,669],spacing:2.8,side:-1},
 {lot:1,start:[1207,687],end:[1175,766],spacing:2.8,side:1},
 {lot:2,start:[1537,884],end:[1715,891],spacing:2.9,side:-1},
];
function contains(p:T.Vector2,ring:T.Vector2[]){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
function pointDistanceSquared(p:T.Vector2,a:T.Vector2,b:T.Vector2){const dx=b.x-a.x,dy=b.y-a.y,t=T.MathUtils.clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return (p.x-a.x-dx*t)**2+(p.y-a.y-dy*t)**2;}
function segmentDistanceSquared(a:T.Vector2,b:T.Vector2,c:T.Vector2,d:T.Vector2){
 const ux=b.x-a.x,uy=b.y-a.y,vx=d.x-c.x,vy=d.y-c.y,denominator=ux*vy-uy*vx;
 if(Math.abs(denominator)>1e-10){const dx=c.x-a.x,dy=c.y-a.y,t=(dx*vy-dy*vx)/denominator,u=(dx*uy-dy*ux)/denominator;if(t>=0&&t<=1&&u>=0&&u<=1)return 0;}
 return Math.min(pointDistanceSquared(a,c,d),pointDistanceSquared(b,c,d),pointDistanceSquared(c,a,b),pointDistanceSquared(d,a,b));
}
/** Cars, painted lines and pavement share one layout. Reject entire stalls at lot
 * edges and across pedestrian paths; partial painted spaces are not usable.
 */
export function createParkingLayout(project:(p:{lon:number;lat:number})=>T.Vector2,roads:LandscapeData['roads']):ParkingLayout{
 const pixel=([x,y]:Pixel)=>project({lon:-121.8294+x/2048*.0078,lat:37.2774-y/1200*.0036});
 const lots=LOTS.map(ring=>ring.map(pixel)),bays:ParkingBay[]=[];
 const segments=roads.filter(road=>road.kind==='path').flatMap(road=>road.points.slice(1).map((p,i)=>({a:new T.Vector2(...road.points[i]),b:new T.Vector2(...p),clearance:road.width/2+.25})));
 ROWS.forEach((row,rowIndex)=>{
  const a=pixel(row.start),b=pixel(row.end),length=a.distanceTo(b),count=Math.floor(length/row.spacing),direction=b.clone().sub(a).normalize(),normal=new T.Vector2(-direction.y,direction.x),halfWidth=length/count/2;
  for(let slot=0;slot<=count;slot++){
   const center=a.clone().lerp(b,slot/count),corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([along,across])=>center.clone().addScaledVector(direction,along*halfWidth).addScaledVector(normal,across*2.55));
   const lot=lots[row.lot];
   if(!corners.every(p=>contains(p,lot)))continue;
   // Also reject edges that cut across a concave corner of the paved outline.
   if(corners.some((p,i)=>lot.some((q,j)=>segmentDistanceSquared(p,corners[(i+1)%4],q,lot[(j+1)%lot.length])<.01)))continue;
   const box=new T.Box2().setFromPoints(corners);
   if(segments.some(({a,b,clearance})=>{
    if(Math.max(a.x,b.x)+clearance<box.min.x||Math.min(a.x,b.x)-clearance>box.max.x||Math.max(a.y,b.y)+clearance<box.min.y||Math.min(a.y,b.y)-clearance>box.max.y)return false;
    return contains(a,corners)||contains(b,corners)||corners.some((p,i)=>segmentDistanceSquared(a,b,p,corners[(i+1)%4])<=clearance**2);
   }))continue;
   bays.push({row:rowIndex,slot,center,corners,yaw:Math.atan2(direction.x,direction.y)+row.side*Math.PI/2,occupied:slot%9!==4});
  }
 });
 return {lots,bays};
}
