"use client";
import { useActionState, useCallback, useEffect, useState } from "react";
import { completeChannelTask } from "@/app/booking-actions";
import type { ActionState } from "@/app/actions";
import type { HotelContext } from "@/components/hotel-dashboard";
import { createClient } from "@/lib/supabase/client";
import { channelLabel } from "@/lib/booking/channels";

type Task = {id:string;reason:string;updated_at:string;reservation_id:string;reservations:{source:string;channel_name:string|null;external_reference:string|null;arrival_date:string;departure_date:string;status:string}|null};
function TaskCompletion({task,onSaved}:{task:Task;onSaved:()=>void}){
  const [state,action,pending]=useActionState(completeChannelTask,{} as ActionState);
  useEffect(()=>{if(state.success)onSaved();},[state,onSaved]);
  return <form action={action} className="channel-task-action"><input type="hidden" name="task_id" value={task.id}/><input type="hidden" name="updated_at" value={task.updated_at}/><label>Calendar check note<input name="note" required minLength={5} maxLength={500} placeholder="What did you check or update in Booking.com?"/></label><button className="button" disabled={pending}>{pending?"Saving…":"Mark manually checked"}</button>{state.error&&<p className="form-error" role="alert">{state.error}</p>}</form>;
}
export function ChannelInventoryPanel({context}:{context?:HotelContext}){
  const [tasks,setTasks]=useState<Task[]>([]);const [count,setCount]=useState(0);const [error,setError]=useState("");const [revision,setRevision]=useState(0);
  const canWork=Boolean(context&&["owner","manager","front_desk"].includes(context.role));
  const propertyId=context?.propertyId;
  const refresh=useCallback(()=>setRevision(value=>value+1),[]);
  useEffect(()=>{
    if(!canWork||!propertyId)return;let stopped=false;
    async function load(){if(document.visibilityState==="hidden")return;
      const {data,error,count}=await createClient().from("channel_inventory_tasks").select("id,reason,updated_at,reservation_id,reservations(source,channel_name,external_reference,arrival_date,departure_date,status)",{count:"exact"}).eq("property_id",propertyId).eq("status","pending").order("updated_at",{ascending:false}).limit(100);
      if(stopped)return;if(error){setError("Apply the channel booking update to activate the calendar checklist.");return;}
      setTasks((data??[]) as unknown as Task[]);setCount(count??0);setError("");
    }
    void load();const timer=setInterval(()=>void load(),20000);return()=>{stopped=true;clearInterval(timer);};
  },[canWork,propertyId,revision]);
  if(!canWork)return null;
  return <section className="panel booking-channels-panel"><div className="panel-heading"><div><strong>Booking channels</strong><small>Website · reception · phone · WhatsApp · Booking.com</small></div><span className="status-pill amber-pill">Automatic Booking.com sync not connected</span></div><div className="channel-panel-content"><p>Reservations entered here share our room inventory. Until the Booking.com connection is configured, reception must also check and update its calendar for new bookings, cancellations and room changes.</p><div className="channel-panel-toolbar"><a className="button" href="https://admin.booking.com/" target="_blank" rel="noreferrer">Open Booking.com Extranet</a><button className="button" onClick={refresh}>Refresh checklist</button></div>{error?<p className="form-error" role="status">{error}</p>:<details><summary>{count} calendar check{count===1?"":"s"} pending</summary>{!tasks.length?<p className="empty-state">No pending calendar checks.</p>:tasks.map(task=><article className="channel-task" key={`${task.id}:${task.updated_at}`}><div><strong>Reservation {task.reservation_id.slice(0,8).toUpperCase()}</strong><span className="status-pill">{task.reservations?.status.replaceAll("_"," ")}</span></div><p>{channelLabel(task.reservations?.source,task.reservations?.channel_name)}{task.reservations?.external_reference?` · ${task.reservations.external_reference}`:""} · {task.reservations?.arrival_date} → {task.reservations?.departure_date}</p><small>{task.reason}</small><TaskCompletion task={task} onSaved={refresh}/></article>)}{count>tasks.length&&<p>Showing the latest {tasks.length} of {count} pending checks.</p>}</details>}</div></section>;
}
