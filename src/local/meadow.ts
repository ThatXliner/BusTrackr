import * as T from 'three';

// Small instanced clumps give the modeled hillside a silhouette at bus height.
// Distant views use the tiled terrain material instead of drawing every blade.
export function addMeadow(scene:T.Scene,height:(x:number,z:number)=>number,naturalAt:(x:number,z:number)=>boolean,buildings:T.Vector2[][],min:T.Vector2,max:T.Vector2){
 let seed=82619;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const positions:number[]=[];
 for(let i=0;i<9;i++){const angle=i*2.4,width=.035+random()*.025,h=.22+random()*.32,x=Math.cos(angle)*.18,z=Math.sin(angle)*.18,dx=Math.cos(angle+1)*width,dz=Math.sin(angle+1)*width;positions.push(x-dx,0,z-dz,x+dx,0,z+dz,x+Math.cos(angle)*.13,h,z+Math.sin(angle)*.13);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
 const material=new T.MeshStandardMaterial({color:'#b1a27a',roughness:1,side:T.DoubleSide});
 const bounds=buildings.map(ring=>new T.Box2().setFromPoints(ring).expandByScalar(2));
 const cells=new Map<string,T.Vector3[]>();let count=0;
 for(let z=min.y;z<max.y;z+=7)for(let x=min.x;x<max.x;x+=7){
  const xx=x+random()*5,zz=z+random()*5;if(!naturalAt(xx,zz)||bounds.some(box=>box.containsPoint(new T.Vector2(xx,zz))))continue;
  const key=`${Math.floor(xx/100)},${Math.floor(zz/100)}`,cell=cells.get(key)||[];cell.push(new T.Vector3(xx,height(xx,zz),zz));cells.set(key,cell);count++;
 }
 const chunks:T.InstancedMesh[]=[],dummy=new T.Object3D();
 for(const points of cells.values()){
  const mesh=new T.InstancedMesh(geometry,material,points.length);
  points.forEach((p,i)=>{dummy.position.copy(p);dummy.rotation.y=random()*Math.PI*2;dummy.scale.setScalar(.6+random()*.9);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new T.Color().setHSL(.11+random()*.035,.18+random()*.1,.55+random()*.2));});
  mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);chunks.push(mesh);
 }
 return {count,update(camera:T.Object3D){for(const mesh of chunks){const bounds=mesh.boundingSphere!;mesh.visible=camera.position.distanceTo(bounds.center)-bounds.radius<150;}}};
}
