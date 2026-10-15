import { brand } from "./brand";
// The serializer contains RIVL GPS/OSM overlays, not provider basemap data.
// Callers must exclude Google-derived geometry before selecting this renderer.
export { mapPayload } from "./google-map-document";

/** Official Mapbox CDN version checked against its CDN guide on 2026-10-14. */
export const MAPBOX_GL_VERSION = "3.32.0";
export function mapboxMapDocument(token: string, dark = false) {
  const encodedToken = JSON.stringify(token.trim()).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.css" rel="stylesheet"><style>html,body,#map{height:100%;width:100%;margin:0;background:${dark ? brand.ink : brand.warm}}body{overflow:hidden}.mapboxgl-ctrl-attrib a:focus-visible,.mapboxgl-ctrl-logo:focus-visible{outline:2px solid ${brand.coral};outline-offset:2px}</style></head><body><div id="map" aria-label="Mapbox route map"></div><script>
  const token=${encodedToken};
  let map,latest,apiReady=false,styleReady=false,styleKey='',overrideType,geometryKey='',hasCamera=false,wasFollowing=false,followPaused=false,sourceKeys=new Map();
  const send=value=>window.ReactNativeWebView?window.ReactNativeWebView.postMessage(JSON.stringify(value)):window.parent.postMessage({rivlMap:true,...value},'*');
  const valid=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
  const coordinate=p=>[p.lng,p.lat];
  const collection=features=>({type:'FeatureCollection',features});
  const feature=(geometry,properties={})=>({type:'Feature',properties,geometry});
  const styleFor=p=>{const type=p.mapStyle||overrideType||'roadmap';return 'mapbox://styles/mapbox/'+(type==='satellite'?'satellite-streets-v12':type==='terrain'?'outdoors-v12':p.dark?'dark-v11':'streets-v12')};
  function lineFeatures(groups,properties={}){
    const features=[];
    for(const group of groups||[]){let part=[],previous;
      const flush=()=>{if(part.length>1)features.push(feature({type:'LineString',coordinates:part},properties));part=[]};
      for(const point of group||[]){if(!valid(point)){flush();previous=undefined;continue}if(previous&&point.segment!==undefined&&previous.segment!==undefined&&point.segment!==previous.segment)flush();part.push(coordinate(point));previous=point}flush();
    }return features;
  }
  function seedFor(p){return [p.center,...(p.lines||[]).flat(),...(p.network||[]).flat(),...(p.exploration||[]).flatMap(t=>t.points),...(p.cells||[]),...(p.waypoints||[]),...(p.reference||[]),...(p.highlights||[]).flatMap(h=>h.points),...(p.tiles?p.tiles.features.flatMap(f=>f.geometry.coordinates[0].map(pt=>({lat:pt[1],lng:pt[0]}))):[])].find(valid)}
  function source(id,features,attribution){const data=collection(features),key=JSON.stringify(data),existing=map.getSource(id);if(!existing){map.addSource(id,{type:'geojson',data,...(attribution?{attribution}:{})});sourceKeys.set(id,key)}else if(sourceKeys.get(id)!==key){existing.setData(data);sourceKeys.set(id,key)}}
  function layer(value){if(!map.getLayer(value.id))map.addLayer(value)}
  function lineLayer(id,sourceId,color,width,opacity=1,filter,dash){layer({id,type:'line',source:sourceId,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':color,'line-width':width,'line-opacity':opacity,...(dash?{'line-dasharray':dash}:{})},...(filter?{filter}:{})})}
  function interactions(enabled){for(const name of ['dragPan','scrollZoom','boxZoom','doubleClickZoom','touchZoomRotate']){const handler=map[name];if(handler)handler[enabled?'enable':'disable']()}if(map.keyboard)map.keyboard.disable()}
  function overlays(p){
    source('rivl-network',lineFeatures(p.network),'© OpenStreetMap contributors');
    source('rivl-exploration',(p.exploration||[]).flatMap(t=>lineFeatures([t.points],{color:t.latest?'${brand.coral}':'${brand.blue}'})));
    source('rivl-routes',lineFeatures(p.lines,{unverified:!!p.unverified}));
    source('rivl-reference',lineFeatures([p.reference]));
    source('rivl-highlights',(p.highlights||[]).flatMap(h=>lineFeatures([h.points],{color:h.color,title:h.title})));
    source('rivl-density',(p.cells||[]).filter(valid).map(cell=>feature({type:'Point',coordinates:coordinate(cell)},{visits:Math.max(1,Number(cell.visits)||1)})));
    source('rivl-tiles',p.tiles?p.tiles.features:[]);
    const pins=[],pin=(p,color,title,user=false)=>{if(valid(p))pins.push(feature({type:'Point',coordinates:coordinate(p)},{color,title,user}))};
    const actual=(p.lines||[]).flat().filter(valid);
    if(actual.length){pin(actual[0],'${brand.green}','Start');if(actual.length>1)pin(actual[actual.length-1],'${brand.ink}','Finish')}
    (p.waypoints||[]).forEach((pt,i)=>pin(pt,i===0?'${brand.green}':'${brand.ink}','Stop '+(i+1)));
    (p.highlights||[]).forEach(h=>pin(h.points[Math.floor(h.points.length/2)],h.color,h.title));
    pin(p.user,'${brand.blue}','Your position',true);source('rivl-markers',pins);
    layer({id:'rivl-tile-fill',type:'fill',source:'rivl-tiles',paint:{'fill-color':['case',['>', ['get','visits'],1],'${brand.coral}','${brand.green}'],'fill-opacity':0.27,'fill-outline-color':p.dark?'#FFFFFF':'${brand.ink}'}});
    layer({id:'rivl-density-points',type:'circle',source:'rivl-density',paint:{'circle-color':'${brand.coral}','circle-radius':['interpolate',['linear'],['get','visits'],1,14,10,30],'circle-opacity':0.3,'circle-blur':0.5}});
    lineLayer('rivl-network-line','rivl-network','${brand.blue}',1.5,0.8);
    lineLayer('rivl-exploration-wash','rivl-exploration',['get','color'],24,0.065);
    lineLayer('rivl-exploration-core','rivl-exploration',['get','color'],12,0.1);
    lineLayer('rivl-exploration-line','rivl-exploration',['get','color'],2.5,0.85);
    lineLayer('rivl-route-outline','rivl-routes','#FFFFFF',7,1,['==',['get','unverified'],false]);
    lineLayer('rivl-route-line','rivl-routes','${brand.coral}',4,1,['==',['get','unverified'],false]);
    lineLayer('rivl-route-manual','rivl-routes','${brand.coral}',4,1,['==',['get','unverified'],true],[2,2]);
    lineLayer('rivl-reference-line','rivl-reference','${brand.blue}',3,1,undefined,[2,2]);
    lineLayer('rivl-highlight-line','rivl-highlights',['get','color'],7);
    layer({id:'rivl-markers-circle',type:'circle',source:'rivl-markers',paint:{'circle-color':['get','color'],'circle-radius':['case',['get','user'],7,6],'circle-stroke-color':'#FFFFFF','circle-stroke-width':2}});
    map.setPaintProperty('rivl-tile-fill','fill-outline-color',p.dark?'#FFFFFF':'${brand.ink}');
    interactions(!!p.interactive);map.setMinZoom(p.local?10:0);
  }
  function boundsFor(p){const bounds=new mapboxgl.LngLatBounds();
    [...(p.lines||[]).flat(),...(p.network||[]).flat(),...(p.reference||[]),...(p.cells||[]),...(p.exploration||[]).flatMap(t=>t.points),...(p.highlights||[]).flatMap(h=>h.points)].filter(valid).forEach(pt=>bounds.extend(coordinate(pt)));
    if(p.tiles)p.tiles.features.forEach(f=>f.geometry.coordinates[0].forEach(pt=>{if(Number.isFinite(pt[0])&&Number.isFinite(pt[1]))bounds.extend(pt)}));return bounds;
  }
  function camera(p){const gk=JSON.stringify([p.lines,p.network,p.reference,p.cells,p.tiles,p.exploration,p.highlights]),duration=p.reduceMotion?0:250;
    if(p.follow&&!followPaused&&valid(p.center)){map.easeTo({center:coordinate(p.center),...(!hasCamera||!wasFollowing?{zoom:16}:{}),duration});hasCamera=true}
    else if(p.local&&!hasCamera&&valid(p.center)){map.jumpTo({center:coordinate(p.center),zoom:14});hasCamera=true}
    else if(!p.local&&!p.follow){const bounds=boundsFor(p);if(!bounds.isEmpty()&&(!hasCamera||(p.autoFit&&gk!==geometryKey))){map.fitBounds(bounds,{padding:32,maxZoom:17,duration:p.reduceMotion?0:300});hasCamera=true}}
    if(!hasCamera&&valid(p.center)){map.jumpTo({center:coordinate(p.center),zoom:14});hasCamera=true}
    geometryKey=gk;wasFollowing=p.follow;
  }
  window.draw=p=>{latest=p;if(!apiReady)return;
    if(!map){const seed=seedFor(p);if(!seed){send({type:'waiting'});return}try{
      styleKey=styleFor(p);send({type:'loading'});
      map=new mapboxgl.Map({container:'map',accessToken:token,center:coordinate(seed),zoom:14,minZoom:p.local?10:0,style:styleKey,attributionControl:false,logoPosition:'bottom-left',interactive:!!p.interactive,renderWorldCopies:false});
      map.addControl(new mapboxgl.AttributionControl(),'bottom-right');
      map.on('style.load',()=>{styleReady=true;sourceKeys.clear();if(latest)window.draw(latest)});
      map.on('dragstart',()=>{followPaused=true});
      map.on('moveend',()=>{const c=map.getCenter();if(c)send({type:'viewport',lat:c.lat,lng:c.lng})});
      map.on('click',event=>{if(latest&&latest.interactive&&event.lngLat)send({type:'point',lat:event.lngLat.lat,lng:event.lngLat.lng})});
      map.on('idle',()=>{if(styleReady&&map.areTilesLoaded())send({type:'loaded'})});
      map.on('error',event=>{const error=event.error||{};send({type:'error',reason:error.status===401||error.status===403||/access token|unauthorized|forbidden/i.test(error.message||'')?'token':'unavailable'})});
    }catch(error){send({type:'error',reason:'unavailable'});return}}
    const nextStyle=styleFor(p);if(nextStyle!==styleKey){styleKey=nextStyle;styleReady=false;send({type:'loading'});map.setStyle(nextStyle);return}
    if(!styleReady)return;try{overlays(p);camera(p)}catch(error){send({type:'error',reason:'unavailable'})}
  };
  window.recenter=()=>{followPaused=false;if(!map||!latest)return;if(valid(latest.center)){map.easeTo({center:coordinate(latest.center),...(map.getZoom()<14?{zoom:15}:{}),duration:latest.reduceMotion?0:250})}else{hasCamera=false;window.draw(latest)}};
  window.mapType=value=>{if(!['roadmap','satellite','terrain'].includes(value))return;overrideType=value;if(latest)window.draw(latest)};
  window.addEventListener('message',event=>{if(event.source!==window.parent)return;const m=event.data;if(!m||!m.rivlMap)return;if(m.type==='draw')window.draw(m.payload);else if(m.type==='recenter')window.recenter();else if(m.type==='mapType')window.mapType(m.value)});
  window.initMapbox=()=>{if(!token.startsWith('pk.')){send({type:'error',reason:'token'});return}if(typeof mapboxgl==='undefined'||!mapboxgl.supported()){send({type:'error',reason:'unsupported'});return}apiReady=true;send({type:'ready'});if(latest)window.draw(latest)};
  window.mapboxLoadError=()=>send({type:'error',reason:'unavailable'});
  window.addEventListener('pagehide',()=>{if(map)map.remove()});
  </script><script async src="https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.js" onload="window.initMapbox()" onerror="window.mapboxLoadError()"></script></body></html>`;
}
