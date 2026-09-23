import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {createParkingLayout} from '../src/local/parking';
import type {LandscapeData} from '../src/local/landscape';
const data=JSON.parse(readFileSync('public/local-scene/landscape.json','utf8')) as LandscapeData;
const project=(p:{lon:number;lat:number})=>new T.Vector2((p.lon+121.832)*88400,(37.278-p.lat)*111000);
const layout=createParkingLayout(project,data.roads);
function inside(p:T.Vector2,ring:T.Vector2[]){let winding=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],cross=(b.x-a.x)*(p.y-a.y)-(p.x-a.x)*(b.y-a.y);if(a.y<=p.y&&b.y>p.y&&cross>0)winding++;if(a.y>p.y&&b.y<=p.y&&cross<0)winding--;}return winding!==0;}
const distance=(p:T.Vector2,a:T.Vector2,b:T.Vector2)=>{const d=b.clone().sub(a),t=T.MathUtils.clamp(p.clone().sub(a).dot(d)/(d.lengthSq()||1),0,1);return p.distanceTo(a.clone().addScaledVector(d,t));};
assert(layout.bays.filter(b=>b.row===2).length>=6,'The reported row must retain usable parking, not just disappear');
for(const bay of layout.bays){
 // Sample the full boundary, not just centers: half a space over dirt is invalid.
 for(let edge=0;edge<4;edge++)for(let t=0;t<=10;t++){
  const point=bay.corners[edge].clone().lerp(bay.corners[(edge+1)%4],t/10);
  assert(layout.lots.some(lot=>inside(point,lot)),`Bay ${bay.row}/${bay.slot} extends off the paved lot`);
  for(const path of data.roads.filter(r=>r.kind==='path'))for(let i=1;i<path.points.length;i++)assert(distance(point,new T.Vector2(...path.points[i-1]),new T.Vector2(...path.points[i]))>path.width/2+.24,`Bay ${bay.row}/${bay.slot} blocks a pedestrian path`);
 }
 // The car body must fit within the same rectangle used for painted lines.
 for(const x of [-.9,.9])for(const z of [-2.18,2.18]){
  const point=bay.center.clone().add(new T.Vector2(x*Math.cos(bay.yaw)+z*Math.sin(bay.yaw),-x*Math.sin(bay.yaw)+z*Math.cos(bay.yaw)));
  assert(inside(point,bay.corners),'Car footprint must fit within its painted bay');
 }
}
console.log(`Parking layout check passed: ${layout.bays.length} complete paved bays, ${layout.bays.filter(b=>b.occupied).length} cars, no pedestrian-path overlap.`);
