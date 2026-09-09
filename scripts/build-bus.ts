/** Procedural, physically scaled Type C school bus. Exported as a self-contained GLB. */
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import fs from 'node:fs';
const root=new T.Group();
const paint=new T.MeshStandardMaterial({color:'#eeb521',metalness:.28,roughness:.31});
const black=new T.MeshStandardMaterial({color:'#171b1d',metalness:.1,roughness:.5});
const rubber=new T.MeshStandardMaterial({color:'#191b1b',roughness:.94});
const chrome=new T.MeshStandardMaterial({color:'#c5cbd0',metalness:.88,roughness:.22});
const glass=new T.MeshStandardMaterial({color:'#223c48',metalness:.55,roughness:.13});
const red=new T.MeshStandardMaterial({color:'#c72a20',emissive:'#75110b',emissiveIntensity:.5,roughness:.26});
const amber=new T.MeshStandardMaterial({color:'#fba42c',emissive:'#ba4b00',emissiveIntensity:.4,roughness:.25});
const white=new T.MeshStandardMaterial({color:'#fff4d6',emissive:'#fff2cf',emissiveIntensity:.5,roughness:.15});
const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:T.Material=paint,r=.025)=>{const mesh=new T.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)),m);mesh.position.set(x,y,z);root.add(mesh);return mesh;};
const cylinder=(r:number,depth:number,x:number,y:number,z:number,m:T.Material,axis='x')=>{const mesh=new T.Mesh(new T.CylinderGeometry(r,r,depth,24),m);if(axis==='x')mesh.rotation.z=Math.PI/2;if(axis==='z')mesh.rotation.x=Math.PI/2;mesh.position.set(x,y,z);root.add(mesh);return mesh;};
// Vehicle origin is road level; forward is +Z. 10.8 m long, 2.5 m wide.
box(2.42,.32,9.5,0,.95,-.35,black);box(2.46,1.28,8.65,0,1.69,-.6,paint,.10);
box(2.44,1.17,7.68,0,2.85,-1.08,paint,.08);box(2.47,.42,7.82,0,3.45,-1.08,paint,.19);
box(2.40,.85,1.65,0,1.95,4.04,paint,.14);box(2.18,.20,1.7,0,2.43,4.04,paint,.09);
// Cab, split windshield, window gaskets and sliding window crossbars.
box(2.23,.92,.065,0,2.87,2.785,black);for(const x of [-.56,.56])box(1.06,.80,.07,x,2.87,2.83,glass);box(.065,.91,.065,0,2.87,2.88,chrome);
for(const side of [-1,1]){
 for(let i=0;i<9;i++){const z=2.18-i*.79;box(.075,.95,.716,side*1.234,2.88,z,black);box(.08,.82,.63,side*1.25,2.88,z,glass);box(.10,.035,.65,side*1.265,2.94,z,chrome);}
 for(const y of [1.15,1.47,2.23]){box(.07,.065,8.5,side*1.25,y,-.6,black);box(.075,.018,8.5,side*1.258,y+.03,-.6,chrome);}
 // Wheel housings, rivets, mud flaps, side markers.
 for(const z of [-3.22,2.69]){const arch=new T.Mesh(new T.TorusGeometry(.72,.075,6,24,Math.PI),black);arch.rotation.y=Math.PI/2;arch.position.set(side*1.256,.72,z);root.add(arch);box(.1,.60,.13,side*1.22,.40,z-.74,black);}
 for(let i=0;i<18;i++)cylinder(.018,.045,side*1.29,2.08,2.5-i*.41,chrome);
 for(const z of [-4.7,.1,3.9])box(.06,.1,.21,side*1.28,1.69,z,amber);
 // Mirror arms and black-framed mirror glass.
 box(.08,.55,.08,side*1.36,2.66,2.98,black);box(.46,.07,.08,side*1.53,2.94,2.98,chrome);box(.16,.55,.34,side*1.77,2.93,3.0,black);box(.04,.46,.26,side*1.86,2.93,3,chrome);
 cylinder(.17,.07,side*1.57,2.28,4.24,chrome,'z');box(.055,.56,.055,side*1.53,2.05,4.21,black);
}
// Folding entry door on curb side with glazed panels and three steps.
box(.085,1.93,.83,1.27,2.04,2.27,black);for(const z of [2.06,2.48])box(.09,1.55,.33,1.32,2.19,z,glass);
for(let i=0;i<3;i++)box(.33,.11,.74,1.12+i*.08,.63+i*.2,2.3,chrome);
// Front grille, lamps, bumper, tow hooks and license plate.
box(1.31,.65,.12,0,1.83,4.91,chrome);box(1.19,.57,.13,0,1.83,4.97,black);
for(let i=0;i<10;i++)box(1.17,.019,.04,0,1.58+i*.056,5.045,chrome);
for(const x of [-.93,.93]){cylinder(.18,.1,x,1.95,4.97,chrome,'z');cylinder(.135,.12,x,1.95,5.02,white,'z');box(.28,.12,.1,x,1.62,5.01,amber);}
box(2.64,.28,.26,0,1.09,5.02,black,.065);box(.43,.20,.04,0,1.04,5.17,chrome);for(const x of [-.69,.69])cylinder(.06,.08,x,1.06,5.18,chrome,'z');
// Rear emergency door, rear lamps and bumper.
box(1.02,2.15,.07,0,2.14,-4.98,black);box(.94,2.05,.08,0,2.14,-5.025,paint);box(.82,.76,.04,0,2.87,-5.08,glass);box(.25,.045,.055,.27,2.16,-5.09,chrome);
box(2.60,.28,.25,0,1.04,-5.05,black,.045);for(const x of [-.93,.93]){cylinder(.12,.08,x,1.63,-5.035,red,'z');cylinder(.10,.08,x,1.36,-5.035,amber,'z');}
for(const z of [-5.01,2.91])for(const x of [-1,-.69,.69,1])cylinder(.115,.07,x,3.28,z,Math.abs(x)>.9?red:amber,'z');
for(const z of [-5.01,2.91])for(const x of [-.18,0,.18])box(.09,.065,.06,x,3.53,z,amber);
// Six heavy-duty tires, dish hubs, lug nuts, fine tread grooves.
for(const z of [-3.22,2.69])for(const side of [-1,1]){
 cylinder(.64,.34,side*1.14,.65,z,rubber);cylinder(.42,.355,side*1.15,.65,z,chrome);cylinder(.32,.38,side*1.15,.65,z,black);cylinder(.245,.40,side*1.15,.65,z,chrome);
 for(let n=0;n<8;n++){const a=n*Math.PI/4;cylinder(.035,.42,side*1.15,.65+Math.sin(a)*.18,z+Math.cos(a)*.18,chrome);}
 for(const dx of [-.10,0,.10]){const ring=new T.Mesh(new T.TorusGeometry(.637,.012,4,40),black);ring.rotation.y=Math.PI/2;ring.position.set(side*1.14+dx,.65,z);root.add(ring);}
}
// Roof hatches, vents, stop paddle and windshield wipers.
for(const z of [-2.7,.3]){box(.79,.07,.9,0,3.685,z,chrome,.035);for(let n=0;n<6;n++)box(.65,.015,.025,0,3.73,z-.3+n*.11,black);}
for(const x of [-.53,.53]){const w=box(.035,.46,.035,x,2.65,2.91,black);w.rotation.z=.4;}
const stop=new T.Mesh(new T.CylinderGeometry(.30,.30,.045,8),red);stop.rotation.z=Math.PI/2;stop.position.set(-1.31,2.12,1.48);root.add(stop);
// Mesh lettering is legible without textures or runtime font requests.
import {FontLoader} from 'three/addons/loaders/FontLoader.js';import {TextGeometry} from 'three/addons/geometries/TextGeometry.js';
const font=new FontLoader().parse(JSON.parse(fs.readFileSync('scripts/helvetiker.json','utf8')));
function lettering(text:string,size:number,x:number,y:number,z:number,angle:number){const geometry=new TextGeometry(text,{font,size,depth:.002,curveSegments:2,bevelEnabled:false});geometry.computeBoundingBox();const w=geometry.boundingBox!.max.x;geometry.translate(-w/2,0,0);const mesh=new T.Mesh(geometry,black);mesh.rotation.y=angle;mesh.position.set(x,y,z);root.add(mesh);}
lettering('SCHOOL BUS',.135,0,3.42,2.87,0);lettering('SCHOOL BUS',.16,0,3.19,-5.09,Math.PI);
lettering('VALLEY CHRISTIAN',.20,1.297,1.82,-1.4,Math.PI/2);lettering('VALLEY CHRISTIAN',.20,-1.297,1.82,-1.4,-Math.PI/2);lettering('01',.16,1.299,1.70,-4.4,Math.PI/2);
root.updateMatrixWorld(true);
// Minimal GLB writer: bake transforms, standard PBR materials, share one primitive per material.
const byMaterial=new Map<T.Material,{p:number[];n:number[]}>();const normalMatrix=new T.Matrix3(),v=new T.Vector3();
root.traverse(o=>{if(!(o instanceof T.Mesh))return;let geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry;const material=o.material as T.MeshStandardMaterial;const data=byMaterial.get(material)||{p:[],n:[]};byMaterial.set(material,data);normalMatrix.getNormalMatrix(o.matrixWorld);for(let i=0;i<geo.attributes.position.count;i++){v.fromBufferAttribute(geo.attributes.position,i).applyMatrix4(o.matrixWorld);data.p.push(v.x,v.y,v.z);v.fromBufferAttribute(geo.attributes.normal,i).applyMatrix3(normalMatrix).normalize();data.n.push(v.x,v.y,v.z);}});
const buffers:Buffer[]=[];let length=0;const gltf:any={asset:{version:'2.0',generator:'Valley Shuttle procedural model'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[]}],materials:[],bufferViews:[],accessors:[],buffers:[{byteLength:0}]};
function attribute(data:number[],bounds=false){const array=new Float32Array(data),buffer=Buffer.from(array.buffer);const offset=length;buffers.push(buffer);length+=buffer.length;const view=gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.length,target:34962})-1;const accessor:any={bufferView:view,componentType:5126,count:data.length/3,type:'VEC3'};if(bounds){accessor.min=[Infinity,Infinity,Infinity];accessor.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<data.length;i++){accessor.min[i%3]=Math.min(accessor.min[i%3],data[i]);accessor.max[i%3]=Math.max(accessor.max[i%3],data[i]);}}return gltf.accessors.push(accessor)-1;}
for(const [m0,d]of byMaterial){const m=m0 as T.MeshStandardMaterial;const mi=gltf.materials.push({pbrMetallicRoughness:{baseColorFactor:[m.color.r,m.color.g,m.color.b,1],metallicFactor:m.metalness,roughnessFactor:m.roughness},emissiveFactor:[m.emissive.r*m.emissiveIntensity,m.emissive.g*m.emissiveIntensity,m.emissive.b*m.emissiveIntensity]})-1;gltf.meshes[0].primitives.push({attributes:{POSITION:attribute(d.p,true),NORMAL:attribute(d.n)},material:mi});}
gltf.buffers[0].byteLength=length;let json=Buffer.from(JSON.stringify(gltf));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);const binary=Buffer.concat(buffers);const head=Buffer.alloc(12);head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+json.length+8+binary.length,8);const jh=Buffer.alloc(8);jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);fs.mkdirSync('public/models',{recursive:true});fs.writeFileSync('public/models/valley-bus.glb',Buffer.concat([head,jh,json,bh,binary]));console.log('Bus GLB:',Math.round(binary.length/1024),'KB,',length/24/3,'triangles');
