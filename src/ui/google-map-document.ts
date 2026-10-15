import { brand } from "./brand";
import type { MapProps } from "./map-types";
import { tileFeatures } from "../domain/exploration";
import { routeLines } from "../domain/geo";
export function mapPayload(props: MapProps, dark: boolean) {
  return JSON.stringify({
    lines: props.lines ?? routeLines(props.points),
    network: props.network ?? [],
    highlights: props.highlights ?? [],
    waypoints: props.waypoints ?? [],
    reference: props.reference ?? [],
    center: props.center,
    user: props.showUserLocation ? props.center : undefined,
    follow: !!props.followUser,
    interactive: props.interactive !== false,
    autoFit: props.autoFit !== false,
    cells: props.tiles ? [] : (props.cells ?? []),
    tiles: props.tiles ? tileFeatures(props.tiles) : null,
    exploration: (props.explorationRoutes ?? []).flatMap(
      (route, index, routes) =>
        routeLines(route).map((points) => ({
          points,
          latest: index === routes.length - 1,
        })),
    ),
    local: !!props.localFocus,
    unverified: !!props.unverified,
    mapStyle: props.mapStyle,
    cycling: !!props.cyclingLayer,
    dark,
  });
}
// GPS/replay updates reuse overlays. Only route geometry can request a fit.
export function googleMapDocument(key: string, dark = false) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>html,body,#map{height:100%;width:100%;margin:0;background:${dark ? brand.ink : brand.warm}}body{overflow:hidden}</style></head><body><div id="map" aria-label="Google Maps"></div><script>
  let map,latest,apiReady=false,bikeLayer,geometryKey='',cellsKey='',tilesKey='',themeKey,hasCamera=false,wasFollowing=false,userMarker,followPaused=false;
  const strokes=new Map(),pins=new Map(),density=[];
  const send=v=>window.ReactNativeWebView?window.ReactNativeWebView.postMessage(JSON.stringify(v)):window.parent.postMessage({rivlMap:true,...v},'*');
  const valid=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
  const path=ps=>(ps||[]).filter(valid).map(p=>({lat:p.lat,lng:p.lng}));
  const light=[{featureType:'poi',elementType:'labels.icon',stylers:[{visibility:'off'}]},{featureType:'transit',elementType:'labels.icon',stylers:[{visibility:'off'}]},{featureType:'road',elementType:'geometry',stylers:[{saturation:-80}]},{featureType:'landscape',elementType:'geometry',stylers:[{color:'${brand.warm}'}]}];
  const dark=[{elementType:'geometry',stylers:[{color:'#1D1F22'}]},{elementType:'labels.text.fill',stylers:[{color:'#A5AAA7'}]},{elementType:'labels.text.stroke',stylers:[{color:'#1D1F22'}]},{featureType:'road',elementType:'geometry',stylers:[{color:'#35373A'}]},{featureType:'water',elementType:'geometry',stylers:[{color:'#101114'}]},{featureType:'poi',elementType:'labels.icon',stylers:[{visibility:'off'}]},{featureType:'transit',elementType:'labels.icon',stylers:[{visibility:'off'}]}];
  function stroke(id,ps,color,width,used,bounds,dashed=false,opacity=1){
    const points=path(ps);if(points.length<2)return;used.add(id);let item=strokes.get(id);
    if(!item){item={shape:new google.maps.Polyline({map,geodesic:true}),key:''};strokes.set(id,item)}
    const k=JSON.stringify(points);if(item.key!==k){item.shape.setPath(points);item.key=k}
    item.shape.setOptions({strokeColor:color,strokeWeight:width,strokeOpacity:dashed?0:opacity,zIndex:id.startsWith('wash')?0:id.startsWith('network')?1:id.startsWith('highlight')?5:3,icons:dashed?[{icon:{path:'M 0,-1 0,1',strokeOpacity:1,scale:2},offset:'0',repeat:'12px'}]:[]});
    if(bounds)points.forEach(p=>bounds.extend(p));
  }
  function pin(id,position,color,title,used){
    if(!valid(position))return;used.add(id);let item=pins.get(id);if(!item){item=new google.maps.Marker({map});pins.set(id,item)}
    item.setPosition({lat:position.lat,lng:position.lng});item.setTitle(title||'');item.setIcon({path:google.maps.SymbolPath.CIRCLE,scale:6,fillColor:color,fillOpacity:1,strokeColor:'#FFFFFF',strokeWeight:2});
  }
  window.draw=p=>{
    const ground=p.dark?${JSON.stringify(brand.ink)}:${JSON.stringify(brand.warm)};document.documentElement.style.backgroundColor=ground;document.body.style.backgroundColor=ground;document.getElementById("map").style.backgroundColor=ground;
    latest=p;if(!apiReady)return;if(!map){const seed=valid(p.center)?p.center:[...p.lines.flat(),...p.network.flat(),...(p.exploration||[]).flatMap(t=>t.points),...p.cells,...p.waypoints,...p.reference,...p.highlights.flatMap(h=>h.points),...(p.tiles?p.tiles.features.flatMap(f=>f.geometry.coordinates[0].map(pt=>({lat:pt[1],lng:pt[0]}))):[])].find(valid);if(!seed)return;map=new google.maps.Map(document.getElementById('map'),{backgroundColor:ground,center:seed,zoom:14,minZoom:p.local?10:undefined,disableDefaultUI:true,clickableIcons:false,gestureHandling:'greedy',keyboardShortcuts:false,styles:p.dark?dark:light});map.addListener('tilesloaded',()=>send({type:'loaded'}));map.addListener('dragstart',()=>{followPaused=true});map.addListener('idle',()=>{const c=map.getCenter();if(c)send({type:'viewport',lat:c.lat(),lng:c.lng()})});map.addListener('click',e=>send({type:'point',lat:e.latLng.lat(),lng:e.latLng.lng()}))}const used=new Set(),usedPins=new Set(),bounds=new google.maps.LatLngBounds();
    p.network.forEach((ps,i)=>stroke('network:'+i,ps,'${brand.blue}',1.5,used,bounds));
    (p.exploration||[]).forEach((trace,i)=>{const color=trace.latest?'${brand.coral}':'${brand.blue}',ps=trace.points;stroke('wash:'+i,ps,color,24,used,bounds,false,0.065);stroke('wash-core:'+i,ps,color,12,used,undefined,false,0.10);stroke('explored:'+i,ps,color,2.5,used,undefined,false,0.85)});
    p.lines.forEach((ps,i)=>{if(!p.unverified)stroke('outline:'+i,ps,'#FFFFFF',7,used,bounds);stroke('route:'+i,ps,'${brand.coral}',4,used,p.unverified?bounds:undefined,!!p.unverified)});
    stroke('reference',p.reference,'${brand.blue}',3,used,bounds,true);
    p.highlights.forEach((h,i)=>{stroke('highlight:'+i,h.points,h.color,7,used);pin('highlight:'+i,h.points[Math.floor(h.points.length/2)],h.color,h.title,usedPins)});
    p.waypoints.forEach((pt,i)=>pin('stop:'+i,pt,i===0?'${brand.green}':'${brand.ink}','Stop '+(i+1),usedPins));
    const actual=p.lines.flat().filter(valid);if(actual.length){pin('start',actual[0],'${brand.green}','Start',usedPins);if(actual.length>1)pin('finish',actual[actual.length-1],'${brand.ink}','Finish',usedPins)}
    for(const [id,item]of strokes)if(!used.has(id)){item.shape.setMap(null);strokes.delete(id)}
    for(const [id,item]of pins)if(!usedPins.has(id)){item.setMap(null);pins.delete(id)}
    if(valid(p.user)){if(!userMarker)userMarker=new google.maps.Marker({map,title:'Your position',zIndex:10,icon:{path:google.maps.SymbolPath.CIRCLE,scale:7,fillColor:'${brand.blue}',fillOpacity:1,strokeColor:'#FFFFFF',strokeWeight:3}});userMarker.setPosition(p.user)}else if(userMarker){userMarker.setMap(null);userMarker=null}
    const ck=JSON.stringify(p.cells);if(ck!==cellsKey){cellsKey=ck;density.forEach(o=>o.setMap(null));density.length=0;p.cells.filter(valid).forEach(cell=>{const weight=Math.min(1,Math.log1p(cell.visits)/Math.log(11));density.push(new google.maps.Circle({map,center:cell,radius:90+weight*45,strokeWeight:0,fillColor:'${brand.coral}',fillOpacity:0.10+weight*0.32,clickable:false,zIndex:1}))})}
    p.cells.filter(valid).forEach(pt=>bounds.extend(pt));
    const tk=JSON.stringify(p.tiles);if(tk!==tilesKey){tilesKey=tk;map.data.forEach(f=>map.data.remove(f));if(p.tiles)map.data.addGeoJson(p.tiles)}
    map.data.setStyle(f=>({fillColor:f.getProperty('visits')>1?'${brand.coral}':'${brand.green}',fillOpacity:0.27,strokeColor:p.dark?'#FFFFFF':'${brand.ink}',strokeWeight:0.5,strokeOpacity:0.25,clickable:false}));
    if(p.tiles)p.tiles.features.forEach(f=>f.geometry.coordinates[0].forEach(pt=>bounds.extend({lat:pt[1],lng:pt[0]})));
    if(themeKey!==p.dark){themeKey=p.dark;map.setOptions({styles:p.dark?dark:light,backgroundColor:ground})}
    map.setOptions({gestureHandling:p.interactive?'greedy':'none',draggable:p.interactive,disableDoubleClickZoom:!p.interactive,scrollwheel:p.interactive,keyboardShortcuts:false});
    if(p.mapStyle)window.mapType(p.mapStyle);map.setOptions({minZoom:p.local?10:null});if(p.cycling&&!bikeLayer)bikeLayer=new google.maps.BicyclingLayer();if(bikeLayer)bikeLayer.setMap(p.cycling?map:null);
    const gk=JSON.stringify([p.lines,p.network,p.reference,p.cells,p.tiles,p.exploration]);
    if(p.follow&&!followPaused&&valid(p.center)){if(!hasCamera||!wasFollowing)map.setZoom(16);map.panTo(p.center);hasCamera=true}
    else if(p.local&&!hasCamera&&valid(p.center)){map.setCenter(p.center);map.setZoom(14);hasCamera=true}
    else if(!p.local&&!p.follow&&!bounds.isEmpty()&&(!hasCamera||(p.autoFit&&gk!==geometryKey))){map.fitBounds(bounds,32);google.maps.event.addListenerOnce(map,'idle',()=>{if(map.getZoom()>17)map.setZoom(17)});hasCamera=true}
    else if(!hasCamera&&valid(p.center)){map.setCenter(p.center);map.setZoom(14);hasCamera=true}
    geometryKey=gk;wasFollowing=p.follow;
  };
  window.recenter=()=>{followPaused=false;if(!map||!latest)return;if(valid(latest.center)){map.panTo(latest.center);if(map.getZoom()<14)map.setZoom(15)}else{hasCamera=false;window.draw(latest)}};
  window.mapType=type=>{if(map&&["roadmap","satellite","terrain"].includes(type)&&map.getMapTypeId()!==type){send({type:"loading"});map.setMapTypeId(type)}};
  window.addEventListener('message',event=>{const m=event.data;if(!m||!m.rivlMap)return;if(m.type==='draw')window.draw(m.payload);if(m.type==='recenter')window.recenter();if(m.type==='mapType')window.mapType(m.value)});
  window.gm_authFailure=()=>send({type:'error'});
  window.initMap=()=>{apiReady=true;send({type:'ready'});if(latest)window.draw(latest)};
  </script><script async src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=initMap&loading=async" onerror="window.ReactNativeWebView?window.ReactNativeWebView.postMessage('{\"type\":\"error\"}'):window.parent.postMessage({rivlMap:true,type:'error'},'*')"></script></body></html>`;
}
