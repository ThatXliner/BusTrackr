import fs from 'node:fs';
import buffer from '@turf/buffer';
import {lineString, point} from '@turf/helpers';
import {Cartesian3, Matrix4, Transforms} from 'cesium';

const ROUTES_PATH='public/data/routes.json';
const CORRIDOR_PATH='public/data/corridor.json';
const DETAIL_ZONES_PATH='public/data/detail-zones.json';
const DETAIL_SIZE=1024;
const DETAIL_ROAD_RADIUS_METERS=30;
const DETAIL_EDGE_EROSION_METERS=3;
const ENU_ORIGIN=Cartesian3.fromDegrees(-121.832,37.278,0);
const CAMPUS_RING=[
  [-121.8291,37.2768],[-121.8280,37.2772],[-121.8256,37.2769],
  [-121.8243,37.2770],[-121.8226,37.2767],[-121.8219,37.2756],
  [-121.8224,37.2740],[-121.8250,37.2741],[-121.8268,37.2747],
  [-121.8288,37.2752],
];

const data=JSON.parse(fs.readFileSync(ROUTES_PATH));

function bufferedRoutePolygons(route,radiusKilometers){
  const polygons=[];
  for(let i=0;i<route.length-1;i+=6){
    const segment=route.slice(i,Math.min(i+7,route.length));
    const shape=buffer(lineString(segment.map(p=>[p.lon,p.lat])),radiusKilometers,{units:'kilometers',steps:4});
    if(!shape)continue;
    const rings=shape.geometry.type==='Polygon'?[shape.geometry.coordinates[0]]:shape.geometry.coordinates.map(p=>p[0]);
    for(const ring of rings)polygons.push(ring.slice(0,-1));
  }
  return polygons;
}

// Keep this path byte-for-byte compatible with the existing corridor artifact.
const corridorPolygons=[
  ...bufferedRoutePolygons(data.inbound,.095),
  ...bufferedRoutePolygons(data.outbound,.095),
];
fs.writeFileSync(CORRIDOR_PATH,`${JSON.stringify(corridorPolygons)}\n`);

const roadPriorityPolygons=[
  ...bufferedRoutePolygons(data.inbound,DETAIL_ROAD_RADIUS_METERS/1000),
  ...bufferedRoutePolygons(data.outbound,DETAIL_ROAD_RADIUS_METERS/1000),
];
const fehrenShape=buffer(point([data.inbound[0].lon,data.inbound[0].lat]),.07,{units:'kilometers',steps:4});
const fehrenRings=fehrenShape?.geometry.type==='Polygon'?[fehrenShape.geometry.coordinates[0]]:fehrenShape?.geometry.coordinates.map(p=>p[0])??[];
const priorityWorldPolygons=[
  ...roadPriorityPolygons,
  ...fehrenRings.map(ring=>ring.slice(0,-1)),
  CAMPUS_RING,
];

const enuToWorld=Transforms.eastNorthUpToFixedFrame(ENU_ORIGIN);
const worldToLocal=Matrix4.inverse(enuToWorld,new Matrix4());
const serializedWorldToLocal=Matrix4.toArray(worldToLocal);
function projectToLocal([lon,lat]){
  const world=Cartesian3.fromDegrees(lon,lat,0);
  const local=Matrix4.multiplyByPoint(worldToLocal,world,new Cartesian3());
  return [local.x,local.y];
}
const projectRing=ring=>ring.map(projectToLocal);
const projectedCorridor=corridorPolygons.map(projectRing);
const projectedPriorities=priorityWorldPolygons.map(projectRing);

let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
for(const ring of [...projectedCorridor,...projectedPriorities])for(const [x,y] of ring){
  minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
}
const bounds=[minX-10,minY-10,maxX+10,maxY+10];
const pixelWidth=(bounds[2]-bounds[0])/DETAIL_SIZE;
const pixelHeight=(bounds[3]-bounds[1])/DETAIL_SIZE;

function pointInsideRing(x,y,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i],[xj,yj]=ring[j];
    if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
function distanceSquaredToRing(x,y,ring){
  let closest=Infinity;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [x1,y1]=ring[j],[x2,y2]=ring[i];
    const dx=x2-x1,dy=y2-y1;
    const lengthSquared=dx*dx+dy*dy;
    const t=lengthSquared===0?0:Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/lengthSquared));
    const distanceX=x-(x1+t*dx),distanceY=y-(y1+t*dy);
    closest=Math.min(closest,distanceX*distanceX+distanceY*distanceY);
  }
  return closest;
}

const mask=new Uint8Array(DETAIL_SIZE*DETAIL_SIZE);
for(const ring of projectedPriorities){
  let ringMinX=Infinity,ringMinY=Infinity,ringMaxX=-Infinity,ringMaxY=-Infinity;
  for(const [x,y] of ring){ringMinX=Math.min(ringMinX,x);ringMinY=Math.min(ringMinY,y);ringMaxX=Math.max(ringMaxX,x);ringMaxY=Math.max(ringMaxY,y);}
  const minColumn=Math.max(0,Math.floor((ringMinX-bounds[0])/pixelWidth)-1);
  const maxColumn=Math.min(DETAIL_SIZE-1,Math.ceil((ringMaxX-bounds[0])/pixelWidth)+1);
  const minRow=Math.max(0,Math.floor((ringMinY-bounds[1])/pixelHeight)-1);
  const maxRow=Math.min(DETAIL_SIZE-1,Math.ceil((ringMaxY-bounds[1])/pixelHeight)+1);
  for(let row=minRow;row<=maxRow;row++)for(let column=minColumn;column<=maxColumn;column++){
    const index=row*DETAIL_SIZE+column;
    if(mask[index])continue;
    const x=bounds[0]+(column+.5)*pixelWidth;
    const y=bounds[1]+(row+.5)*pixelHeight;
    if(pointInsideRing(x,y,ring)&&distanceSquaredToRing(x,y,ring)>DETAIL_EDGE_EROSION_METERS**2)mask[index]=1;
  }
}

const maskRuns=[];
for(let index=0;index<mask.length;){
  if(!mask[index]){index++;continue;}
  const start=index;
  while(index<mask.length&&mask[index])index++;
  maskRuns.push([start,index-start]);
}

const detailZones={
  polygons:priorityWorldPolygons,
  worldToLocal:serializedWorldToLocal,
  bounds,
  size:DETAIL_SIZE,
  maskRuns,
  roadRadiusMeters:DETAIL_ROAD_RADIUS_METERS,
};
fs.writeFileSync(DETAIL_ZONES_PATH,`${JSON.stringify(detailZones)}\n`);
console.log(`Corridor polygons: ${corridorPolygons.length}`);
console.log(`Detail zones: ${priorityWorldPolygons.length} polygons, ${maskRuns.length} runs, ${mask.reduce((count,value)=>count+value,0)} pixels`);
