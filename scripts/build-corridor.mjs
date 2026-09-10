import fs from 'node:fs';
import buffer from '@turf/buffer';
import {lineString} from '@turf/helpers';

const ROUTES_PATH='public/data/routes.json';
const CORRIDOR_PATH='public/data/corridor.json';

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
console.log(`Corridor polygons: ${corridorPolygons.length}`);
