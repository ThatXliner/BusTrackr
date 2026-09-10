import * as THREE from 'three';

export type TerrainGrid = {
 minX:number;
 minZ:number;
 stepX:number;
 stepZ:number;
 columns:number;
 rows:number;
};

type ClipVertex={x:number;z:number;lift:number};

const AREA_EPSILON=1e-10;

function gridExtent(grid:TerrainGrid){
 if(!Number.isFinite(grid.minX)||!Number.isFinite(grid.minZ)||!Number.isFinite(grid.stepX)||!Number.isFinite(grid.stepZ)||grid.stepX<=0||grid.stepZ<=0||!Number.isInteger(grid.columns)||!Number.isInteger(grid.rows)||grid.columns<1||grid.rows<1){
  throw new RangeError('Invalid terrain grid: positive steps and integer cell counts are required.');
 }
 const maxX=grid.minX+grid.stepX*grid.columns,maxZ=grid.minZ+grid.stepZ*grid.rows;
 if(!Number.isFinite(maxX)||!Number.isFinite(maxZ))throw new RangeError('Invalid terrain grid: extent is not finite.');
 return {maxX,maxZ};
}

function clampCoordinate(value:number,min:number,max:number,tolerance:number,axis:string){
 if(!Number.isFinite(value))throw new RangeError(`Triangle has a non-finite ${axis} coordinate.`);
 if(value<min-tolerance||value>max+tolerance)throw new RangeError(`Triangle lies outside terrain grid on ${axis}: ${value} is outside [${min}, ${max}].`);
 return Math.min(max,Math.max(min,value));
}

function clipHalfPlane(polygon:ClipVertex[],signedDistance:(point:ClipVertex)=>number,snap?:(point:ClipVertex)=>void){
 if(!polygon.length)return [];
 const output:ClipVertex[]=[];
 let previous=polygon[polygon.length-1],previousDistance=signedDistance(previous),previousInside=previousDistance>=0;
 for(const current of polygon){
  const currentDistance=signedDistance(current),currentInside=currentDistance>=0;
  if(currentInside!==previousInside){
   const denominator=previousDistance-currentDistance;
   let t=denominator?previousDistance/denominator:.5;
   t=Math.min(1,Math.max(0,t));
   const intersection={
    x:previous.x+(current.x-previous.x)*t,
    z:previous.z+(current.z-previous.z)*t,
    lift:previous.lift+(current.lift-previous.lift)*t,
   };
   snap?.(intersection);
   output.push(intersection);
  }
  if(currentInside)output.push(current);
  previous=current;previousDistance=currentDistance;previousInside=currentInside;
 }
 return output;
}

function compactPolygon(polygon:ClipVertex[]){
 if(polygon.length<2)return polygon;
 const compact:ClipVertex[]=[];
 const same=(a:ClipVertex,b:ClipVertex)=>a.x===b.x&&a.z===b.z;
 for(const point of polygon)if(!compact.length||!same(compact[compact.length-1],point))compact.push(point);
 if(compact.length>1&&same(compact[0],compact[compact.length-1]))compact.pop();
 return compact;
}

function clipCellPolygon(polygon:ClipVertex[],left:number,right:number,top:number,bottom:number,stepX:number,stepZ:number){
 let clipped=clipHalfPlane(polygon,point=>point.x-left,point=>{point.x=left;});
 clipped=clipHalfPlane(clipped,point=>right-point.x,point=>{point.x=right;});
 clipped=clipHalfPlane(clipped,point=>point.z-top,point=>{point.z=top;});
 clipped=clipHalfPlane(clipped,point=>bottom-point.z,point=>{point.z=bottom;});
 clipped=compactPolygon(clipped);
 if(!clipped.length)return [[],[]] as [ClipVertex[],ClipVertex[]];
 const diagonal=(point:ClipVertex)=>(point.x-left)/stepX+(point.z-top)/stepZ-1;
 let lower=clipHalfPlane(clipped,point=>-diagonal(point),point=>{point.z=top+(1-(point.x-left)/stepX)*stepZ;});
 let upper=clipHalfPlane(clipped,diagonal,point=>{point.z=top+(1-(point.x-left)/stepX)*stepZ;});
 return [compactPolygon(lower),compactPolygon(upper)] as [ClipVertex[],ClipVertex[]];
}

export function conformTriangle(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,grid:TerrainGrid,height:(x:number,z:number)=>number,emit:(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3)=>void){
 const {maxX,maxZ}=gridExtent(grid),tolerance=1e-9*Math.max(1,Math.abs(grid.minX),Math.abs(grid.minZ),Math.abs(maxX),Math.abs(maxZ),Math.abs(grid.stepX),Math.abs(grid.stepZ));
 const points=[a,b,c];
 const projectedArea=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 const xz=points.map(point=>({x:clampCoordinate(point.x,grid.minX,maxX,tolerance,'x'),z:clampCoordinate(point.z,grid.minZ,maxZ,tolerance,'z')}));
 if(Math.abs(projectedArea)<AREA_EPSILON){emit(a,b,c);return;}

 const source=xz.map((point,index)=>({x:point.x,z:point.z,lift:points[index].y-height(point.x,point.z)}));
 const minTriangleX=Math.min(...source.map(point=>point.x)),maxTriangleX=Math.max(...source.map(point=>point.x));
 const minTriangleZ=Math.min(...source.map(point=>point.z)),maxTriangleZ=Math.max(...source.map(point=>point.z));
 const firstX=Math.max(0,Math.min(grid.columns-1,Math.floor((minTriangleX-grid.minX)/grid.stepX)));
 const lastX=Math.max(0,Math.min(grid.columns-1,Math.floor((maxTriangleX-grid.minX)/grid.stepX)));
 const firstZ=Math.max(0,Math.min(grid.rows-1,Math.floor((minTriangleZ-grid.minZ)/grid.stepZ)));
 const lastZ=Math.max(0,Math.min(grid.rows-1,Math.floor((maxTriangleZ-grid.minZ)/grid.stepZ)));

 for(let iz=firstZ;iz<=lastZ;iz++)for(let ix=firstX;ix<=lastX;ix++){
  const left=grid.minX+ix*grid.stepX,right=ix===grid.columns-1?maxX:left+grid.stepX;
  const top=grid.minZ+iz*grid.stepZ,bottom=iz===grid.rows-1?maxZ:top+grid.stepZ;
  const [lower,upper]=clipCellPolygon(source,left,right,top,bottom,grid.stepX,grid.stepZ);
  for(const polygon of [lower,upper]){
   if(polygon.length<3)continue;
   const vertices=polygon.map(point=>new THREE.Vector3(point.x,height(point.x,point.z)+point.lift,point.z));
   for(let index=1;index<vertices.length-1;index++){
    const first=vertices[0],second=vertices[index],third=vertices[index+1];
    const area=(second.x-first.x)*(third.z-first.z)-(second.z-first.z)*(third.x-first.x);
    if(Math.abs(area)<AREA_EPSILON)continue;
    if(area*projectedArea>0)emit(first,second,third);
    else emit(first,third,second);
   }
  }
 }
}
