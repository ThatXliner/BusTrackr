import fs from 'node:fs';
import sharp from 'sharp';
import {union,intersection} from 'polyclip-ts';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const project=([lon,lat])=>[(lon+121.832)*88400,(37.278-lat)*111000];
const insideRing=([x,z],ring)=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
const distance=(p,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);};
const rings=read('public/data/corridor.json').map(r=>r.map(project));
rings.push([[-121.8291,37.2768],[-121.828,37.2772],[-121.8243,37.2770],[-121.8218,37.2757],[-121.8222,37.2740],[-121.825,37.2741],[-121.8288,37.2752]].map(project));
const boxes=rings.map(r=>[Math.min(...r.map(p=>p[0])),Math.min(...r.map(p=>p[1])),Math.max(...r.map(p=>p[0])),Math.max(...r.map(p=>p[1]))]);
const inside=p=>rings.some((r,i)=>p[0]>=boxes[i][0]&&p[0]<=boxes[i][2]&&p[1]>=boxes[i][1]&&p[1]<=boxes[i][3]&&insideRing(p,r));
const round=p=>p.map(v=>Math.round(v*100)/100);
const osm=read('public/data/osm.json').elements,roads=[],areas=[];
for(const item of osm){
 const tags=item.tags||{},g=item.geometry;if(item.type!=='way'||!g?.length)continue;
 const points=g.map(p=>project([p.lon,p.lat]));
 if(tags.highway&&!['motorway','motorway_link','construction','proposed'].includes(tags.highway)){
  const walking=['footway','path','steps','pedestrian','cycleway'].includes(tags.highway);
  const width=walking?2.2:tags.highway==='service'?5.5:tags.highway==='residential'?7:12;
  let run=[];
  const flush=()=>{if(run.length>1)roads.push({id:item.id,kind:walking?'path':'road',width,points:run});run=[];};
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4);
   for(let j=0;j<=steps;j++){const t=j/steps,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];if(inside(p)){const q=round(p);if(!run.length||q.some((v,k)=>v!==run.at(-1)[k]))run.push(q);}else flush();}
  }
  flush();
 }
 const kind=['residential','grass'].includes(tags.landuse)||tags.leisure==='park'?'lawn':['retail','commercial','industrial','railway'].includes(tags.landuse)?'gravel':null;
 if(kind&&points.some(inside))areas.push({id:item.id,kind,ring:points.slice(0,-1).map(round)});
}
// Preserve the existing vegetation selection as authored instance placements. Aerial
// pixels are consulted only here, never downloaded or sampled by the runtime.
const footprints=read('public/local-scene/footprints.json'),buildings=footprints.buildings.map(b=>b.ring.map(project)).filter(r=>r.every(inside));
const exclusions=footprints.exclusions.map(r=>r.map(project));
exclusions.push([[830,417],[967,430],[962,524],[818,504]].map(([x,y])=>project([-121.8294+x/2048*.0078,37.2774-y/1200*.0036])));
const routes=read('public/data/routes.json'),profiles=read('public/local-scene/road-profiles.json');
const lines=['inbound','outbound'].map(key=>routes[key].map(p=>project([p.lon,p.lat])));
const nearRoad=p=>lines.some((line,k)=>line.some((a,i)=>i>0&&distance(p,line[i-1],a)<profiles[k===0?'inbound':'outbound'][i-1].width/2+1.5));
const bounds=read('public/local-scene/ground-bounds.json'),extent=bounds.extent||bounds;
const min=project([extent.xmin,extent.ymax]),max=project([extent.xmax,extent.ymin]);
const {data,info}=await sharp('public/local-scene/ground.jpg').removeAlpha().raw().toBuffer({resolveWithObject:true});
let seed=84129;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<128*128;i++)random(); // Wall material in the original placement sequence.
const trees=[];
for(let z=min[1];z<max[1];z+=9)for(let x=min[0];x<max[0];x+=9){
 const xx=x+random()*5,zz=z+random()*5,p=[xx,zz];if(!inside(p))continue;
 const u=(xx-min[0])/(max[0]-min[0]),v=(zz-min[1])/(max[1]-min[1]),n=(Math.floor(v*info.height)*info.width+Math.floor(u*info.width))*info.channels;
 const [r,g,b]=data.subarray(n,n+3);if(!(g>r*1.08&&g>b*1.1&&r+g+b<310))continue;
 if(buildings.some(r=>insideRing(p,r))||exclusions.some(r=>insideRing(p,r))||nearRoad(p))continue;
 trees.push([...round(p),Math.round((5+random()*6)*100)/100]);
}
const boundary=intersection(union(...rings.map(r=>[r])),[[[min[0],min[1]],[max[0],min[1]],[max[0],max[1]],[min[0],max[1]],[min[0],min[1]]]]);
const output={boundary,source:'OSM geometry and offline vegetation placements; widths and surface materials are inferred',roads,areas,trees};
fs.writeFileSync('public/local-scene/landscape.json',JSON.stringify(output));
console.log(`Landscape: ${roads.length} road/path sections, ${areas.length} land parcels, ${trees.length} trees; ${JSON.stringify(output).length} bytes`);
