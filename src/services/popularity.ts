import {supabase} from "./supabase";
import type {Coordinate,Sport} from "../domain/types";
import {coordinate} from "../domain/route-planning";
export async function popularCells(center:Coordinate,sport:Sport,since:number){
  if(!supabase)return [];
  const {data,error}=await supabase.rpc("route_popularity",{p_lat:center.lat,p_lng:center.lng,p_sport:sport,p_since:new Date(since).toISOString()});
  if(error)throw error;
  return (data??[]).slice(0,1000).flatMap((row:{lat:number;lng:number;visits:number})=>{try{return [{...coordinate({lat:Number(row.lat),lng:Number(row.lng)}),visits:Math.max(1,Math.min(1000,Number(row.visits)||1))}];}catch{return [];}});
}
