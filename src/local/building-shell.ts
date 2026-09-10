import * as T from 'three';

/** The wall envelope used underneath an independently generated roof. */
export function createBuildingShell(shape:T.Shape,height:number){
 const extrusion=new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1});
 // ExtrudeGeometry includes front/back caps. The dedicated roof owns the top;
 // retaining that cap produces coplanar triangles on shallow pitched roofs.
 const normals=extrusion.getAttribute('normal'),kept:number[]=[];
 for(let i=0;i<normals.count;i+=3){
  if([0,1,2].every(j=>normals.getZ(i+j)>.5))continue;
  kept.push(i,i+1,i+2);
 }
 const shell=new T.BufferGeometry();
 // Keep the underside as well as the walls, including for open-sided shelters.
 for(const [name,attribute] of Object.entries(extrusion.attributes)){
  const values=new Float32Array(kept.length*attribute.itemSize);
  kept.forEach((index,i)=>{for(let component=0;component<attribute.itemSize;component++)values[i*attribute.itemSize+component]=attribute.array[index*attribute.itemSize+component];});
  shell.setAttribute(name,new T.Float32BufferAttribute(values,attribute.itemSize));
 }
 extrusion.dispose();return shell;
}

export function createPitchedRoof(cap:T.BufferGeometry,ring:T.Vector2[],axis:T.Vector2,center:T.Vector2,eave:number,rise:number){
 const perpendicular=new T.Vector2(-axis.y,axis.x);
 const segmentDistance=(p:T.Vector2,a:T.Vector2,b:T.Vector2)=>{const ab=b.clone().sub(a),t=T.MathUtils.clamp(p.clone().sub(a).dot(ab)/(ab.lengthSq()||1),0,1);return p.distanceTo(a.clone().addScaledVector(ab,t));};
   const flat=cap.index?cap.toNonIndexed():cap,positions=flat.getAttribute('position'),triangles:T.Vector2[][]=[];
   const subdivide=(a:T.Vector2,b:T.Vector2,c:T.Vector2,level=0)=>{const edges=[a.distanceToSquared(b),b.distanceToSquared(c),c.distanceToSquared(a)],longest=Math.max(...edges);if(longest<=6.25||level>=10){triangles.push([a,b,c]);return;}const edge=edges.indexOf(longest);if(edge===0){const m=a.clone().lerp(b,.5);subdivide(a,m,c,level+1);subdivide(m,b,c,level+1);}else if(edge===1){const m=b.clone().lerp(c,.5);subdivide(a,b,m,level+1);subdivide(a,m,c,level+1);}else{const m=c.clone().lerp(a,.5);subdivide(a,b,m,level+1);subdivide(m,b,c,level+1);}};
   for(let i=0;i<positions.count;i+=3)subdivide(new T.Vector2(positions.getX(i),positions.getZ(i)),new T.Vector2(positions.getX(i+1),positions.getZ(i+1)),new T.Vector2(positions.getX(i+2),positions.getZ(i+2)));
   const distance=(p:T.Vector2)=>Math.min(...ring.map((a,i)=>segmentDistance(p,a,ring[(i+1)%ring.length]))),maxDistance=Math.max(.1,...triangles.flatMap(t=>t.map(distance))),roofPositions:number[]=[],roofUV:number[]=[];
   // One continuous projection keeps shared vertices aligned across roof facets.
   for(const triangle of triangles){const raised=triangle.map(p=>new T.Vector3(p.x,eave+rise*distance(p)/maxDistance,p.y));for(let i=0;i<3;i++){roofPositions.push(...raised[i].toArray());const offset=triangle[i].clone().sub(center),u=offset.dot(axis),v=offset.dot(perpendicular);roofUV.push(u/2.4,v/2.4);}}
   const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(roofPositions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(roofUV,2));geometry.computeVertexNormals();if(flat!==cap)flat.dispose();cap.dispose();return geometry;
}
