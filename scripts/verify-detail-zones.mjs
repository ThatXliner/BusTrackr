import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Cartesian3, Matrix4} from 'cesium';

const routes=JSON.parse(fs.readFileSync('public/data/routes.json'));
const corridor=JSON.parse(fs.readFileSync('public/data/corridor.json'));
const detail=JSON.parse(fs.readFileSync('public/data/detail-zones.json'));

assert.equal(detail.size,1024);
assert.equal(detail.roadRadiusMeters,30);
assert.equal(detail.worldToLocal.length,16);
assert(detail.worldToLocal.every(Number.isFinite));
assert.equal(detail.bounds.length,4);
assert(detail.bounds.every(Number.isFinite));
assert(detail.bounds[0]<detail.bounds[2]&&detail.bounds[1]<detail.bounds[3]);
assert.equal(detail.polygons.length,corridor.length+2);
for(const ring of detail.polygons){
  assert(ring.length>=3);
  assert.notDeepEqual(ring[0],ring.at(-1));
  for(const coordinate of ring){assert.equal(coordinate.length,2);assert(coordinate.every(Number.isFinite));}
}

const pixelCount=detail.size*detail.size;
const mask=new Uint8Array(pixelCount);
let previousEnd=-1;
let setPixels=0;
for(const run of detail.maskRuns){
  assert.equal(run.length,2);
  const [start,length]=run;
  assert(Number.isInteger(start)&&Number.isInteger(length));
  assert(start>=0&&length>0&&start+length<=pixelCount);
  assert(start>previousEnd,'mask runs must be sorted, disjoint, and merged');
  previousEnd=start+length;
  mask.fill(1,start,start+length);
  setPixels+=length;
}
assert(setPixels>0&&setPixels<=pixelCount);

const worldToLocal=Matrix4.fromArray(detail.worldToLocal);
function localPoint([lon,lat]){
  const world=Cartesian3.fromDegrees(lon,lat,0);
  const local=Matrix4.multiplyByPoint(worldToLocal,world,new Cartesian3());
  return [local.x,local.y];
}
function insideRing([x,y],ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i],[xj,yj]=ring[j];
    if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
function insideAnyWorld(point){return detail.polygons.some(ring=>insideRing(point,ring));}
function maskAt(point){
  const [x,y]=localPoint(point);
  const [minX,minY,maxX,maxY]=detail.bounds;
  const column=Math.floor((x-minX)/(maxX-minX)*detail.size);
  const row=Math.floor((y-minY)/(maxY-minY)*detail.size);
  if(column<0||column>=detail.size||row<0||row>=detail.size)return false;
  return mask[row*detail.size+column]===1;
}
function assertPrioritySample(name,point){
  assert(insideAnyWorld(point),`${name} must be inside a priority polygon`);
  assert(maskAt(point),`${name} must be represented in the priority mask`);
}

const campusCenter=[-121.8264,37.2759];
assertPrioritySample('campus center',campusCenter);

const mainroadSegment=Math.floor((routes.inbound.length-1)/2);
const mainroadStart=routes.inbound[mainroadSegment];
const mainroadEnd=routes.inbound[mainroadSegment+1];
const mainroadMidpoint=[
  (mainroadStart.lon+mainroadEnd.lon)/2,
  (mainroadStart.lat+mainroadEnd.lat)/2,
];
assertPrioritySample('mainroad midpoint',mainroadMidpoint);

assertPrioritySample('Fehren first point',[routes.inbound[0].lon,routes.inbound[0].lat]);

const exterior=[-121.832,37.29];
assert(!insideAnyWorld(exterior),'unrelated exterior must be outside all priority polygons');
assert(!maskAt(exterior),'unrelated exterior must be absent from the priority mask');

console.log(JSON.stringify({size:detail.size,polygons:detail.polygons.length,runs:detail.maskRuns.length,pixels:setPixels},null,2));
