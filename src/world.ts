import {
  Viewer, Ion, Cesium3DTileset, Cartesian3, Cartographic, Color, Math as CM,
  ClippingPolygon, ClippingPolygonCollection, HeadingPitchRange, HeadingPitchRoll,
  Transforms, CallbackPositionProperty, CallbackProperty, ConstantProperty,
  PolylineGlowMaterialProperty, DistanceDisplayCondition, LabelStyle, Cartesian2,
  VerticalOrigin, HeightReference, ShadowMode, ScreenSpaceEventType, Matrix4,
  BoundingSphere, JulianDate, Entity, Quaternion, CustomShader, UniformType, TextureUniform, Cartesian4, TextureMinificationFilter, TextureMagnificationFilter,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

export type Geo = {lat:number;lon:number};
export type Snapshot = {progress:number[];distance:number[];fps:number;selected:number;loaded:boolean;pending:number;mode:string;speedMph:number;location:string};
type Routes={inbound:Geo[];outbound:Geo[]};
type Elevation={width:number;height:number;west:number;north:number;dx:number;dy:number;values:number[]};
type DetailZones={polygons:number[][][];worldToLocal:number[];bounds:number[];size:number;maskRuns:number[][];roadRadiusMeters:number};
type Path={points:Geo[];cumulative:number[];length:number};
const ORIGIN={lat:37.278,lon:-121.832};
const flat=(p:Geo)=>({x:(p.lon-ORIGIN.lon)*88400,z:(p.lat-ORIGIN.lat)*111000});
function makePath(points:Geo[]):Path {const cumulative=[0];for(let i=1;i<points.length;i++){const a=flat(points[i-1]),b=flat(points[i]);cumulative.push(cumulative[i-1]+Math.hypot(b.x-a.x,b.z-a.z));}return {points,cumulative,length:cumulative.at(-1)!};}
function interpolate(path:Path,t:number){const distance=Math.max(0,Math.min(1,t))*path.length;let i=1;while(i<path.cumulative.length-1&&path.cumulative[i]<distance)i++;const a=path.points[i-1],b=path.points[i];const f=(distance-path.cumulative[i-1])/(path.cumulative[i]-path.cumulative[i-1]||1);const heading=Math.atan2((b.lon-a.lon)*88400,(b.lat-a.lat)*111000);return {lat:a.lat+(b.lat-a.lat)*f-Math.sin(heading)*1.7/111000,lon:a.lon+(b.lon-a.lon)*f+Math.cos(heading)*1.7/88400,heading};}
function sourceHeight(d:Elevation,p:Geo){const x=CM.clamp((p.lon-d.west)/d.dx,0,d.width-2),y=CM.clamp((d.north-p.lat)/d.dy,0,d.height-2);const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;const h=(row:number)=>d.values[row*d.width+ix]*(1-fx)+d.values[row*d.width+ix+1]*fx;return h(iy)*(1-fy)+h(iy+1)*fy;}

export async function createWorld(host:HTMLDivElement,onTick:(s:Snapshot)=>void,onError:(s:string)=>void){
 const token=import.meta.env.VITE_CESIUM_ION_TOKEN;
 if(!token)throw Error('Photorealistic scenery is ready to connect. Add the Cesium read-only token to .env.local, then restart the preview.');
 const assetUrl=(path:string)=>`${import.meta.env.BASE_URL}${path}`;
 const [data,dem,corridor,detail]=await Promise.all(['data/routes.json','terrain/elevation.json','data/corridor.json','data/detail-zones.json'].map(async path=>{const r=await fetch(assetUrl(path));if(!r.ok)throw Error('Route data could not be loaded.');return r.json();})) as [Routes,Elevation,number[][][],DetailZones];
 Ion.defaultAccessToken=token;
 const mobile=()=>host.clientWidth<650;
 const viewer=new Viewer(host,{
   globe:false,baseLayer:false,baseLayerPicker:false,geocoder:false,homeButton:false,
   navigationHelpButton:false,sceneModePicker:false,timeline:false,animation:false,
   fullscreenButton:false,selectionIndicator:false,infoBox:false,skyBox:false,
   skyAtmosphere:false,shouldAnimate:false,requestRenderMode:true,maximumRenderTimeChange:Infinity,targetFrameRate:30,
   contextOptions:{webgl:{alpha:false,antialias:false,powerPreference:'high-performance'}},
 });
 viewer.useBrowserRecommendedResolution=false;
 viewer.resolutionScale=Math.min(window.devicePixelRatio,mobile()?1:1.25)/window.devicePixelRatio;
 viewer.scene.backgroundColor=Color.fromCssColorString('#101b24');
 viewer.scene.fog.enabled=false;if(viewer.scene.sun)viewer.scene.sun.show=false;if(viewer.scene.moon)viewer.scene.moon.show=false;
 viewer.scene.postProcessStages.fxaa.enabled=true;
 viewer.scene.screenSpaceCameraController.minimumZoomDistance=8;
 viewer.scene.screenSpaceCameraController.maximumZoomDistance=5500;
 viewer.scene.screenSpaceCameraController.enableCollisionDetection=true;
 viewer.scene.highDynamicRange=false;viewer.scene.msaaSamples=1;
 viewer.shadows=false;viewer.shadowMap.softShadows=true;viewer.shadowMap.size=1024;
 viewer.clock.currentTime=JulianDate.fromIso8601('2026-09-09T22:00:00Z');
 const paths=[makePath(data.inbound),makePath(data.outbound)];
 let disposed=false,selected=0,paused=false,speed=1,mode='campus',elapsed=0,last=performance.now(),lastTick=0,loaded=false,pending=0;
 const starts=[.90,.16,.44];const positions=starts.map((t,i)=>{const p=interpolate(paths[i===1?1:0],t);return Cartesian3.fromDegrees(p.lon,p.lat,sourceHeight(dem,p)-30);});const orientations=starts.map((t,i)=>Transforms.headingPitchRollQuaternion(positions[i],new HeadingPitchRoll(interpolate(paths[i===1?1:0],t).heading-Math.PI/2,0,0)));const busHeights=[0,0,0];const sampledAt=[-Infinity,-Infinity,-Infinity],heightOffsets=[-30,-30,-30];const exclude:Entity[]=[];
 const mask=new Uint8Array(detail.size*detail.size*4);
 for(const [start,length] of detail.maskRuns)mask.fill(255,start*4,(start+length)*4);
 const backgroundMask=new CustomShader({uniforms:{
  u_priority:{type:UniformType.SAMPLER_2D,value:new TextureUniform({typedArray:mask,width:detail.size,height:detail.size,repeat:false,minificationFilter:TextureMinificationFilter.NEAREST,magnificationFilter:TextureMagnificationFilter.NEAREST})},
  u_local:{type:UniformType.MAT4,value:Matrix4.fromArray(detail.worldToLocal)},
  u_bounds:{type:UniformType.VEC4,value:new Cartesian4(...detail.bounds as [number,number,number,number])},
 },fragmentShaderText:`void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  vec2 p=(u_local*vec4(fsInput.attributes.positionWC,1.0)).xy;
  vec2 uv=(p-u_bounds.xy)/(u_bounds.zw-u_bounds.xy);
  if(all(greaterThanEqual(uv,vec2(0.0))) && all(lessThanEqual(uv,vec2(1.0))) && texture(u_priority,uv).r>0.5) discard;
 }`});
 let tileset!:Cesium3DTileset,background!:Cesium3DTileset;
 try{
  tileset=await Cesium3DTileset.fromIonAssetId(2275207,{
   maximumScreenSpaceError:mobile()?8:6,
   cacheBytes:(mobile()?160:224)*1024*1024,maximumCacheOverflowBytes:32*1024*1024,
   skipLevelOfDetail:false,enableCollision:true,showCreditsOnScreen:true,shadows:ShadowMode.RECEIVE_ONLY,
   dynamicScreenSpaceError:true,foveatedScreenSpaceError:true,
  });
  if(disposed){tileset.destroy();throw Error('View closed');}
  const polygons=detail.polygons.map(ring=>new ClippingPolygon({positions:ring.map(p=>Cartesian3.fromDegrees(p[0],p[1]))}));
  if(!ClippingPolygonCollection.isSupported(viewer.scene))throw Error('This device does not support the WebGL2 corridor clipping required by this view.');
  tileset.clippingPolygons=new ClippingPolygonCollection({polygons,inverse:true});
  // A separate coarse layer carries context; the mask prevents it covering priority surfaces.
  background=await Cesium3DTileset.fromIonAssetId(2275207,{
   maximumScreenSpaceError:mobile()?32:24,cacheBytes:(mobile()?32:48)*1024*1024,maximumCacheOverflowBytes:16*1024*1024,
   enableCollision:false,shadows:ShadowMode.DISABLED,
   dynamicScreenSpaceError:true,foveatedScreenSpaceError:true,showCreditsOnScreen:true,
  });
  background.customShader=backgroundMask;
  background.clippingPolygons=new ClippingPolygonCollection({polygons:corridor.map(ring=>new ClippingPolygon({positions:ring.map(p=>Cartesian3.fromDegrees(p[0],p[1]))})),inverse:true});
  viewer.scene.primitives.add(background);viewer.scene.primitives.add(tileset);
 }catch(e){viewer.destroy();if(tileset&&!tileset.isDestroyed())tileset.destroy();if(background&&!background.isDestroyed())background.destroy();backgroundMask.destroy();throw Error(`Could not load photorealistic scenery. ${e instanceof Error?e.message:'Check your Cesium token and Google 3D Tiles access.'}`);}
 const loadCounts=[0,0];
 const loadSubscriptions=[tileset,background].map((layer,i)=>layer.loadProgress.addEventListener((requests:number,processing:number)=>{loadCounts[i]=requests+processing;pending=loadCounts[0]+loadCounts[1];}));
 const unsubscribeLoad=()=>loadSubscriptions.forEach(remove=>remove());
 const unsubscribeReady=tileset.tileVisible.addEventListener(()=>{loaded=true;});
 let reportedTileError=false;
 const failureSubscriptions=[tileset,background].map(layer=>layer.tileFailed.addEventListener((e:{message:string})=>{if(!reportedTileError&&/401|403|429/.test(e.message)){reportedTileError=true;onError('The 3D data provider rejected a tile request. Check token access or the monthly free quota.');}}));
 const unsubscribeFailure=()=>failureSubscriptions.forEach(remove=>remove());
 const routeEntities=paths.map((path,i)=>viewer.entities.add({polyline:{positions:path.points.map(p=>Cartesian3.fromDegrees(p.lon,p.lat)),clampToGround:true,width:5,material:new PolylineGlowMaterialProperty({glowPower:.16,color:Color.fromCssColorString(i===0?'#56d6ca':'#f0b950')})}}));
 const buses=starts.map((_,i)=>{
  const e=viewer.entities.add({id:`shuttle-${i}`,position:new CallbackPositionProperty((_time,result)=>Cartesian3.clone(positions[i],result),false),orientation:new CallbackProperty((_time,result)=>Quaternion.clone(orientations[i],result),false),model:{uri:assetUrl('models/valley-bus.glb'),scale:1,minimumPixelSize:mode==='overview'?22:0,maximumScale:3,runAnimations:false,shadows:ShadowMode.ENABLED,imageBasedLightingFactor:new Cartesian2(1,1)},label:{show:true,text:`${String(i+1).padStart(2,'0')}`,font:'600 12px sans-serif',fillColor:Color.WHITE,showBackground:true,backgroundColor:Color.fromCssColorString('#15252ce6'),backgroundPadding:new Cartesian2(9,6),pixelOffset:new Cartesian2(0,-28),verticalOrigin:VerticalOrigin.BOTTOM,style:LabelStyle.FILL,distanceDisplayCondition:new DistanceDisplayCondition(45,5000)}});exclude.push(e);return e;
 });
 const stops=[{text:'FEHREN LOT',p:data.inbound[0]},{text:'SKYWAY CAMPUS',p:data.outbound[0]}].map(({text,p})=>viewer.entities.add({position:Cartesian3.fromDegrees(p.lon,p.lat),point:{pixelSize:8,color:Color.fromCssColorString('#f4dd9d'),outlineColor:Color.fromCssColorString('#0b1823'),outlineWidth:3,heightReference:HeightReference.CLAMP_TO_3D_TILE},label:{text,font:'600 11px sans-serif',fillColor:Color.WHITE,showBackground:true,backgroundColor:Color.fromCssColorString('#111f2cdd'),backgroundPadding:new Cartesian2(13,9),pixelOffset:new Cartesian2(0,-25),heightReference:HeightReference.CLAMP_TO_3D_TILE,disableDepthTestDistance:15000}}));exclude.push(...stops,...routeEntities);
 const center=Cartesian3.fromDegrees(-121.8325,37.2784,65);
 function release(){viewer.camera.cancelFlight();viewer.camera.lookAtTransform(Matrix4.IDENTITY);}
 function overview(flat=false){mode=flat?'map':'overview';release();viewer.camera.flyToBoundingSphere(new BoundingSphere(center,970),{duration:1.4,offset:new HeadingPitchRange(CM.toRadians(-37),CM.toRadians(flat?-89:-47),host.clientWidth<650?2800:2500)});}
 function focus(where:'campus'|'lot'){mode=where;release();const p=where==='campus'?{lon:-121.8264,lat:37.2759}:{lon:-121.8408,lat:37.2842};viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(p.lon,p.lat,sourceHeight(dem,p)),150),{duration:1.2,offset:new HeadingPitchRange(CM.toRadians(where==='campus'?-42:145),CM.toRadians(-36),490)});}
 focus('campus');
  let frames=0,totalFrames=0,heightSamples=0,fpsAt=performance.now(),fps=0,previousMode='';const liveLocations:Geo[]=[];
 const lastSamplePositions=positions.map(p=>Cartesian3.clone(p));
 let tileRevision=0;const sampleRevisions=[-1,-1,-1];
 const unsubscribeTileLoad=tileset.tileLoad.addEventListener(()=>{tileRevision++;});
 const unsubscribeRendered=viewer.scene.postRender.addEventListener(()=>{frames++;totalFrames++;});
 function configureQuality(){
  viewer.resolutionScale=Math.min(window.devicePixelRatio,mobile()?1:1.25)/window.devicePixelRatio;
  tileset.maximumScreenSpaceError=mode==='bus'?(mobile()?6:4):(mobile()?8:6);
  tileset.cacheBytes=(mobile()?160:224)*1024*1024;
  background.maximumScreenSpaceError=mobile()?32:24;background.cacheBytes=(mobile()?32:48)*1024*1024;
  viewer.shadows=mode==='bus';
  viewer.scene.requestRender();
 }
 function update(){if(disposed)return;const now=performance.now(),dt=Math.max(0,Math.min((now-last)/1000,.15));last=now;if(now-fpsAt>1000){fps=Math.round(frames*1000/(now-fpsAt));frames=0;fpsAt=now;}if(!paused&&loaded){elapsed+=dt*speed;viewer.scene.requestRender();}
  if(previousMode!==mode){previousMode=mode;configureQuality();}
  let sampledThisFrame=false;
  starts.forEach((start,i)=>{const path=paths[i===1?1:0],t=(start+elapsed/480)%1,p=interpolate(path,t);liveLocations[i]=p;
   // Sample the visible 3D road surface, excluding overlays and vehicles. DEM is only a loading fallback.
   const demHeight=sourceHeight(dem,p);
   if(!sampledThisFrame&&Cartesian3.distance(viewer.camera.positionWC,positions[i])<700
     &&now-sampledAt[i]>(i===selected?750:2000)
     &&(sampleRevisions[i]!==tileRevision||Cartesian3.distance(positions[i],lastSamplePositions[i])>3)){
    sampledThisFrame=true;heightSamples++;
    const sample=viewer.scene.sampleHeight(Cartographic.fromDegrees(p.lon,p.lat),[...exclude,background],.6);
    if(sample!==undefined&&Number.isFinite(sample))heightOffsets[i]=sample-demHeight;
    sampledAt[i]=now;sampleRevisions[i]=tileRevision;Cartesian3.clone(positions[i],lastSamplePositions[i]);
   }
   const targetHeight=demHeight+heightOffsets[i];
   if(Math.abs(targetHeight-busHeights[i])>.02)viewer.scene.requestRender();
   busHeights[i]=busHeights[i]?busHeights[i]+CM.clamp(targetHeight-busHeights[i],-dt*12,dt*12):targetHeight;
   Cartesian3.fromDegrees(p.lon,p.lat,busHeights[i]+.1,undefined,positions[i]);
   // Cesium converts glTF +Z forward into local +X (east); our route bearing starts at north.
   const before=interpolate(path,Math.max(0,t-.001)),after=interpolate(path,Math.min(1,t+.001));
   const hBefore=sourceHeight(dem,before),hAfter=sourceHeight(dem,after);const a=flat(before),b=flat(after);const slope=Math.atan2(hAfter-hBefore,Math.hypot(b.x-a.x,b.z-a.z));
   Transforms.headingPitchRollQuaternion(positions[i],new HeadingPitchRoll(p.heading-Math.PI/2,slope,0),undefined,undefined,orientations[i]);
   (buses[i].model!.minimumPixelSize as ConstantProperty).setValue(mode==='overview'||mode==='map'?24:0);
   (buses[i].label!.show as ConstantProperty).setValue(mode!=='bus');
  });
  if(mode==='follow'||mode==='bus'){
   const p=interpolate(paths[selected===1?1:0],(starts[selected]+elapsed/480)%1);
   const angle=mode==='bus'?p.heading+CM.toRadians(20):p.heading+Math.PI+CM.toRadians(23);
   const target=Cartesian3.fromDegrees(p.lon,p.lat,busHeights[selected]+(mode==='bus'?2:1));
   viewer.camera.lookAt(target,new HeadingPitchRange(angle,CM.toRadians(mode==='bus'?-48:-40),mode==='bus'?32:110));
  }
  routeEntities.forEach(e=>e.show=mode!=='bus');
  if(now-lastTick>350){host.dataset.diagnostics=JSON.stringify({busHeights,positions:liveLocations,fps,pending,loaded,mode,totalFrames,heightSamples,pixelRatio:viewer.resolutionScale*window.devicePixelRatio,screenSpaceError:tileset.maximumScreenSpaceError,backgroundScreenSpaceError:background.maximumScreenSpaceError,priorityRadiusMeters:detail.roadRadiusMeters,priorityCacheMB:Math.round(tileset.totalMemoryUsageInBytes/1024/1024),backgroundCacheMB:Math.round(background.totalMemoryUsageInBytes/1024/1024),cacheMB:Math.round((tileset.totalMemoryUsageInBytes+background.totalMemoryUsageInBytes)/1024/1024)});onTick({progress:starts.map(p=>(p+elapsed/480)%1),distance:paths.map(p=>p.length),fps,selected,loaded,pending,mode,speedMph:paused?0:Math.round(paths[selected===1?1:0].length/480*2.23694),location:mode==='campus'?'SKYWAY CAMPUS':mode==='lot'?'FEHREN LOT':selected===1?'SKYWAY → FEHREN':'FEHREN → SKYWAY'});lastTick=now;}
 }
 const unsubscribeFrame=viewer.scene.preUpdate.addEventListener(update);
 // A failed render should leave a recoverable screen rather than a frozen loader.
 const unsubscribeError=viewer.scene.renderError.addEventListener(()=>onError('The 3D renderer was interrupted. Reload the scene to recover.'));
 viewer.screenSpaceEventHandler.setInputAction((event:{position:Cartesian2})=>{const picked=viewer.scene.pick(event.position);if(picked?.id instanceof Entity&&picked.id.id.startsWith('shuttle-')){selected=Number(picked.id.id.split('-')[1]);mode='follow';}},ScreenSpaceEventType.LEFT_CLICK);
 const beginExplore=()=>{if(mode==='follow'||mode==='bus'){release();mode='explore';}};
 host.addEventListener('pointerdown',beginExplore);
 const resize=new ResizeObserver(()=>{viewer.resize();configureQuality();});resize.observe(host);
 const visibilityChanged=()=>{viewer.useDefaultRenderLoop=!document.hidden;last=performance.now();if(!document.hidden)viewer.scene.requestRender();};
 document.addEventListener('visibilitychange',visibilityChanged);
 // Small, read-only diagnostics support repeatable local verification without exposing credentials.
 (window as unknown as {__valleyDiagnostics:()=>unknown}).__valleyDiagnostics=()=>({mode,loaded,pending,fps,corridorRadiusMeters:95,clippingPolygons:tileset.clippingPolygons.length,tilesLoaded:tileset.tilesLoaded,selected,positions:liveLocations,cacheMB:Math.round((tileset.totalMemoryUsageInBytes+background.totalMemoryUsageInBytes)/1024/1024),busHeights:[...busHeights],progress:starts.map(p=>(p+elapsed/480)%1)});
 return {
  setSelected(i:number){selected=i;},setFollow(v:boolean){if(v){release();mode='follow';}else overview();},
  setPaused(v:boolean){paused=v;viewer.scene.requestRender();},setSpeed(v:number){speed=v;},setFlat(v:boolean){overview(v);},reset(){overview();},
  zoom(f:number){if(mode==='follow'||mode==='bus')return;const h=viewer.camera.positionCartographic.height;if(f<1)viewer.camera.zoomIn(h*(1-f));else viewer.camera.zoomOut(h*(f-1));},
  inspect(){release();mode='bus';},focusStop:focus,
  setRoute(i:number){routeEntities.forEach((e,j)=>{e.polyline!.width=new ConstantProperty(i===j?6:3);});},
  dispose(){disposed=true;host.removeEventListener('pointerdown',beginExplore);resize.disconnect();document.removeEventListener('visibilitychange',visibilityChanged);unsubscribeRendered();unsubscribeTileLoad();unsubscribeFrame();unsubscribeLoad();unsubscribeReady();unsubscribeFailure();unsubscribeError();if(!viewer.isDestroyed())viewer.destroy();backgroundMask.destroy();},stats:{buildings:0},
 };
}
