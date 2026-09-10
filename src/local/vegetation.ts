import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** A shared volumetric crown replaces the three intersecting tree billboards. */
export function createTreeGeometry(random:()=>number){
 const parts:T.BufferGeometry[]=[];
 // Overlapping small foliage sprays have thickness and changing silhouettes from every view.
 for(let i=0;i<200;i++){
  const angle=random()*Math.PI*2,vertical=random()*2-1,radius=Math.cbrt(random())*.43;
  const radial=Math.sqrt(1-vertical*vertical)*radius;
  const center=new T.Vector3(Math.cos(angle)*radial,.64+vertical*radius*.86,Math.sin(angle)*radial);
  const spray=new T.PlaneGeometry(.1+random()*.1,.1+random()*.09);
  spray.rotateX(random()*Math.PI);spray.rotateY(random()*Math.PI);spray.rotateZ(random()*Math.PI);spray.translate(...center.toArray());
  const colors=[];const shade=.8+random()*.2;for(let v=0;v<4;v++)colors.push(shade,shade,shade);spray.setAttribute('color',new T.Float32BufferAttribute(colors,3));parts.push(spray);
 }
 const crown=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());
 return crown;
}

export function addVegetation(scene:T.Scene,positions:{x:number;z:number;y:number;h:number}[],random:()=>number,leafMap:T.Texture,renderer:T.WebGLRenderer){
 const detailed=createTreeGeometry(random),farPlanes=[0,1,2].map(i=>{const p=new T.PlaneGeometry(1.08,1.08);p.rotateY(i*Math.PI/3);p.translate(0,.64,0);return p;});const coarse=mergeGeometries(farPlanes,false)!;farPlanes.forEach(p=>p.dispose());
 const leaf=new T.MeshStandardMaterial({map:leafMap,alphaTest:.5,side:T.DoubleSide,roughness:1,color:'#ffffff',vertexColors:true});
 // The far crown is a local render of this same geometry, not an unrelated silhouette.
 // Bake once; the render target remains owned by this vegetation module.
 const crownTarget=new T.WebGLRenderTarget(512,512,{generateMipmaps:true,minFilter:T.LinearMipmapLinearFilter,depthBuffer:true});
 const bakeScene=new T.Scene(),bakeMaterial=new T.MeshBasicMaterial({map:leafMap,alphaTest:.5,side:T.DoubleSide,vertexColors:true});
 bakeScene.add(new T.Mesh(detailed,bakeMaterial));
 const bakeCamera=new T.OrthographicCamera(-.54,.54,.54,-.54,.1,4);bakeCamera.position.set(0,.64,2);bakeCamera.lookAt(0,.64,0);
 const oldTarget=renderer.getRenderTarget(),oldColor=renderer.getClearColor(new T.Color()),oldAlpha=renderer.getClearAlpha(),oldToneMapping=renderer.toneMapping;
 // Green transparent RGB limits black bleed when the baked crown is filtered.
 renderer.setRenderTarget(crownTarget);renderer.setClearColor(new T.Color('#536044'),0);renderer.toneMapping=T.NoToneMapping;renderer.render(bakeScene,bakeCamera);
 renderer.setRenderTarget(oldTarget);renderer.setClearColor(oldColor,oldAlpha);renderer.toneMapping=oldToneMapping;bakeMaterial.dispose();
 const distant=new T.MeshStandardMaterial({map:crownTarget.texture,alphaTest:.35,side:T.DoubleSide,roughness:1});
 const trunkParts:T.BufferGeometry[]=[];
 const limb=(a:T.Vector3,b:T.Vector3,bottom:number,top:number)=>{const g=new T.CylinderGeometry(top,bottom,a.distanceTo(b),5);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());trunkParts.push(g);};
 limb(new T.Vector3(),new T.Vector3(.025,.71,.01),.036,.012);
 for(let i=0;i<5;i++){const angle=i*2.4;limb(new T.Vector3(.01,.31+i*.04,0),new T.Vector3(Math.cos(angle)*.29,.64+i*.025,Math.sin(angle)*.29),.015,.004);}
 const trunkGeometry=mergeGeometries(trunkParts,false)!;trunkParts.forEach(g=>g.dispose());const bark=new T.MeshStandardMaterial({color:'#655747',roughness:1});
 const cells=new Map<string,typeof positions>();
 for(const p of positions){const key=`${Math.floor(p.x/100)},${Math.floor(p.z/100)}`;const cell=cells.get(key)||[];cell.push(p);cells.set(key,cell);}
 const chunks:{near:T.InstancedMesh;far:T.InstancedMesh}[]=[],dummy=new T.Object3D();
 for(const cell of cells.values()){
  const near=new T.InstancedMesh(detailed,leaf,cell.length),far=new T.InstancedMesh(coarse,distant,cell.length),trunks=new T.InstancedMesh(trunkGeometry,bark,cell.length);
  cell.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,random()*Math.PI*2,0);dummy.scale.set(p.h,p.h,p.h);dummy.updateMatrix();near.setMatrixAt(i,dummy.matrix);far.setMatrixAt(i,dummy.matrix);trunks.setMatrixAt(i,dummy.matrix);});
  near.castShadow=true;near.receiveShadow=true;far.receiveShadow=true;near.computeBoundingSphere();far.computeBoundingSphere();trunks.computeBoundingSphere();scene.add(near,far,trunks);chunks.push({near,far});
 }
 return {crownTexture:crownTarget.texture,dispose(){crownTarget.dispose();},update(camera:T.Object3D){for(const chunk of chunks){const bounds=chunk.near.boundingSphere!;const detailed=Math.max(0,bounds.center.distanceTo(camera.position)-bounds.radius)<240;chunk.near.visible=detailed;chunk.far.visible=!detailed;}}};
}
