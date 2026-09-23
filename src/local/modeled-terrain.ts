import * as T from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {conformTriangle,type TerrainGrid} from './terrain-conform';

/** Clip the measured grid to the exact corridor outline, instead of discarding
 * whole edge cells (which made sawtooth edges and floating pavement fragments).
 */
export function createModeledTerrain(boundary:[number,number][][][],grid:TerrainGrid,height:(x:number,z:number)=>number){
 const positions:number[]=[],uvs:number[]=[],colors:number[]=[];
 for(const polygon of boundary){
  const rings=polygon.map(ring=>ring.slice(0,-1).map(([x,z])=>new T.Vector2(x,z)));
  const points=rings.flat(),faces=T.ShapeUtils.triangulateShape(rings[0],rings.slice(1));
  for(const face of faces){
   const [a,b,c]=face.map(i=>new T.Vector3(points[i].x,height(points[i].x,points[i].y),points[i].y));
   conformTriangle(a,b,c,grid,height,(a,b,c)=>{
    if(b.clone().sub(a).cross(c.clone().sub(a)).y<0)[b,c]=[c,b];
    for(const p of [a,b,c]){positions.push(p.x,p.y,p.z);uvs.push(p.x/2.8,p.z/2.8);const variation=Math.sin(p.x/37)*Math.sin(p.z/29)*.07+Math.sin((p.x+p.z)/93)*.05,tone=.88+variation;colors.push(tone,tone,tone);}
   });
  }
 }
 const raw=new T.BufferGeometry();raw.setAttribute('position',new T.Float32BufferAttribute(positions,3));raw.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));raw.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 const geometry=mergeVertices(raw,1e-4);raw.dispose();geometry.computeVertexNormals();return geometry;
}
