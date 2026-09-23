import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createModeledTerrain} from '../src/local/modeled-terrain';
const grid={minX:0,minZ:0,stepX:4,stepZ:4,columns:6,rows:6};
function height(x:number,z:number){const gx=Math.min(x/4,5.999999),gz=Math.min(z/4,5.999999),ix=Math.floor(gx),iz=Math.floor(gz),fx=gx-ix,fz=gz-iz,y=(x:number,z:number)=>Math.sin(x*.6)*4+z*.4;return fx+fz<=1?y(ix,iz)+(y(ix+1,iz)-y(ix,iz))*fx+(y(ix,iz+1)-y(ix,iz))*fz:y(ix+1,iz+1)+(y(ix,iz+1)-y(ix+1,iz+1))*(1-fx)+(y(ix+1,iz)-y(ix+1,iz+1))*(1-fz);}
const boundary:[number,number][][][]=[[[[0,0],[24,0],[24,16],[12,16],[12,24],[0,24],[0,0]],[[4,4],[4,8],[8,8],[8,4],[4,4]]]];
const geometry=createModeledTerrain(boundary,grid,height),p=geometry.getAttribute('position'),index=geometry.getIndex()!;let area=0;
for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2),cross=(p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a))-(p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a));assert(cross>0,'Terrain winding must face upward');area+=cross/2;
 const x=(p.getX(a)+p.getX(b)+p.getX(c))/3,z=(p.getZ(a)+p.getZ(b)+p.getZ(c))/3,y=(p.getY(a)+p.getY(b)+p.getY(c))/3;
 assert(Math.abs(y-height(x,z))<1e-4,'Clipped terrain must retain the road-contact surface');
 assert(!(x>4&&x<8&&z>4&&z<8),'Do not fill boundary holes');
}
assert(Math.abs(area-464)<1e-4,'Boundary area must be exact, including concave edges and holes');geometry.dispose();
const data=JSON.parse(readFileSync('public/local-scene/landscape.json','utf8'));
assert(data.boundary.length>0&&data.roads.length>0&&data.areas.length>0&&data.trees.length>0);
for(const tree of data.trees)assert(tree.length===3&&tree.every(Number.isFinite)&&tree[2]>0);
for(const road of data.roads)assert(road.width>0&&road.points.length>=2&&road.points.flat().every(Number.isFinite));
console.log(`Modeled terrain check passed: exact clipped area, holes, upward normals and road contact; ${data.trees.length} tree placements.`);
