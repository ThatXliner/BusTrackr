import assert from 'node:assert/strict';
import * as T from 'three';
import {buildRoads,type RoadPath} from '../src/local/roads';

// CPU geometry check. Texture drawing is irrelevant to road/terrain intersection.
const context={createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
Object.defineProperty(globalThis,'document',{value:{createElement:()=>({width:0,height:0,getContext:()=>context})}});
const grid={minX:-30,minZ:-30,stepX:6,stepZ:6,columns:20,rows:20};
const height=(x:number,z:number)=>{
 const gx=(x-grid.minX)/6,gz=(z-grid.minZ)/6,ix=Math.floor(gx),iz=Math.floor(gz),fx=gx-ix,fz=gz-iz;
 const y=(i:number,j:number)=>(i+j)%2?6:0,a=y(ix,iz),b=y(ix+1,iz),c=y(ix,iz+1),d=y(ix+1,iz+1);
 return fx+fz<=1?a+(b-a)*fx+(c-a)*fz:d+(c-d)*(1-fx)+(b-d)*(1-fz);
};
const paths:RoadPath[]=[{points:[new T.Vector2(-10,-10),new T.Vector2(30,20)],profiles:[{name:'folded terrain fixture',highway:'service',wayId:null,width:6.5,lanes:2,curb:false}]}];
const scene=new T.Scene();
const result=buildRoads(scene,paths,height,grid);
// This invokes the actual road builder over a terrain with sharp grid folds.
// The old vertex-only sampling crosses ridges even with 16 cm vertex lift.
assert.ok(result.minimumClearance>=.159,`Road penetrates folded terrain: minimum clearance ${result.minimumClearance.toFixed(6)} m`);
console.log(`Road contact check passed: minimum sampled clearance ${result.minimumClearance.toFixed(6)} m`);
