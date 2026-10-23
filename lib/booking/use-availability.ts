"use client";
import { useEffect, useState } from "react";
import type { Availability } from "./types";
import { stayError } from "./validation";
export function useAvailability(arrival: string,departure: string,guests: string) {
  const [revision,setRevision]=useState(0);
  const [result,setResult]=useState<{key:string;data?:Availability;error?:string}>();
  const key=`${arrival}:${departure}:${guests}:${revision}`;
  const valid=!stayError(arrival,departure,Number(guests));
  useEffect(()=>{
    if(!valid) return;
    const controller=new AbortController();
    fetch(`/api/booking/availability?${new URLSearchParams({arrival,departure,guests})}`,{signal:controller.signal,cache:"no-store"})
      .then(async r=>{const data=await r.json();if(!r.ok||data.error)throw new Error(data.error || "Availability could not be checked.");return data as Availability;})
      .then(data=>setResult({key,data})).catch(error=>{if(!controller.signal.aborted)setResult({key,error:error.message});});
    return ()=>controller.abort();
  },[key,valid,arrival,departure,guests]);
  return {refresh:()=>setRevision(v=>v+1),data:result?.key===key?result.data:undefined,error:result?.key===key?result.error:undefined,loading:valid&&result?.key!==key,valid};
}
