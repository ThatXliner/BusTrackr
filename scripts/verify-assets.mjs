import fs from 'node:fs';
import assert from 'node:assert/strict';
import buffer from '@turf/buffer';
import {lineString} from '@turf/helpers';
const model=fs.readFileSync('public/models/valley-bus.glb');
assert.equal(model.readUInt32LE(0),0x46546c67);assert.equal(model.readUInt32LE(4),2);assert.equal(model.readUInt32LE(8),model.length);
const jsonLength=model.readUInt32LE(12),asset=JSON.parse(model.subarray(20,20+jsonLength).toString());
assert(asset.materials.length>=8);assert(asset.meshes[0].primitives.length>=8);
let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const primitive of asset.meshes[0].primitives){const a=asset.accessors[primitive.attributes.POSITION];assert(a.count>0);assert.equal(a.count%3,0);a.min.forEach((v,i)=>min[i]=Math.min(min[i],v));a.max.forEach((v,i)=>max[i]=Math.max(max[i],v));}
const dimensions=max.map((v,i)=>v-min[i]);assert(dimensions[0]>3&&dimensions[0]<4);assert(dimensions[1]>3.5&&dimensions[1]<4);assert(dimensions[2]>10&&dimensions[2]<11);
const data=JSON.parse(fs.readFileSync('public/data/routes.json'));assert.deepEqual(data.inbound[0],data.outbound.at(-1));assert.deepEqual(data.inbound.at(-1),data.outbound[0]);
const corridor=JSON.parse(fs.readFileSync('public/data/corridor.json'));const polygons=[];for(const route of [data.inbound,data.outbound])for(let i=0;i<route.length-1;i+=6){const points=route.slice(i,Math.min(i+7,route.length));const shape=buffer(lineString(points.map(p=>[p.lon,p.lat])),.095,{units:'kilometers',steps:4});assert(shape?.geometry);const rings=shape.geometry.type==='Polygon'?[shape.geometry.coordinates[0]]:shape.geometry.coordinates.map(p=>p[0]);for(const ring of rings)polygons.push(ring.slice(0,-1));}assert.deepEqual(corridor,polygons);assert.equal(corridor.length,polygons.length);
const dem=JSON.parse(fs.readFileSync('public/terrain/elevation.json'));assert.equal(dem.values.length,dem.width*dem.height);assert(dem.values.every(Number.isFinite));
console.log(JSON.stringify({busDimensionsMeters:dimensions.map(x=>+x.toFixed(2)),busTriangles:asset.accessors.filter((_,i)=>i%2===0).reduce((n,a)=>n+a.count/3,0),routePoints:[data.inbound.length,data.outbound.length],corridorRadiusMeters:95,clippingPolygons:corridor.length,elevationSamples:dem.values.length},null,2));
