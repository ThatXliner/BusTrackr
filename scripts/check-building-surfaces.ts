import assert from 'node:assert/strict';
import * as T from 'three';
import {createBuildingShell,createPitchedRoof} from '../src/local/building-shell';

// Real wall-builder seam: its generated top must never overlap the separate roof.
for(const [name,points] of Object.entries({caravan:[[0,0],[12,0],[12,3],[0,3]],concave:[[0,0],[12,0],[12,5],[5,5],[5,12],[0,12]]})){
 const ring=points.map(([x,z])=>new T.Vector2(x,z)),center=ring.reduce((a,p)=>a.add(p),new T.Vector2()).multiplyScalar(1/ring.length);
 const cap=new T.ShapeGeometry(new T.Shape(ring.map(p=>new T.Vector2(p.x,-p.y))));cap.rotateX(-Math.PI/2);
 const roof=createPitchedRoof(cap,ring,new T.Vector2(1,0),center,3,.45),positions=roof.getAttribute('position'),uv=roof.getAttribute('uv');
 const coordinates=new Map<string,number[]>();let seams=0;
 for(let i=0;i<positions.count;i++){const key=[positions.getX(i),positions.getY(i),positions.getZ(i)].map(n=>n.toFixed(5)).join(',');const previous=coordinates.get(key),next=[uv.getX(i),uv.getY(i)];if(previous&&previous.some((v,j)=>Math.abs(v-next[j])>1e-5))seams++;coordinates.set(key,next);}
 assert.equal(seams,0,`${name}: ${seams} shared roof vertices have discontinuous texture coordinates`);
 let roofArea=0;for(let i=0;i<positions.count;i+=3){const a=new T.Vector2(positions.getX(i),positions.getZ(i)),b=new T.Vector2(positions.getX(i+1),positions.getZ(i+1)),c=new T.Vector2(positions.getX(i+2),positions.getZ(i+2));roofArea+=Math.abs(b.clone().sub(a).cross(c.clone().sub(a)))/2;}
 const footprintArea=Math.abs(T.ShapeUtils.area(ring));assert(Math.abs(roofArea-footprintArea)<1e-5,`${name}: roof must cover the footprint exactly once`);roof.dispose();
 const shell=createBuildingShell(new T.Shape(points.map(([x,y])=>new T.Vector2(x,y))),3);
 const p=shell.getAttribute('position');let topTriangles=0;
 for(let i=0;i<p.count;i+=3)if([0,1,2].every(j=>Math.abs(p.getZ(i+j)-3)<1e-6))topTriangles++;
 assert.equal(topTriangles,0,`${name}: wall shell contains ${topTriangles} roof-level triangles competing with the dedicated roof`);
 assert(p.count>0,'wall envelope must remain');
 const normals=shell.getAttribute('normal');assert(Array.from({length:normals.count},(_,i)=>normals.getZ(i)).some(n=>n<-.9),'shelter underside must remain');shell.dispose();
}
console.log('Building surface check passed: no duplicate roofs, continuous UVs, full coverage, and retained undersides.');
