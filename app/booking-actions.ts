"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "./actions";
import { runBookingTasks } from "@/lib/booking/tasks";
import { verifyPayment } from "@/lib/booking/server";
import { refreshBookingRefunds, refreshProviderRefund } from "@/lib/booking/reconciliation";
async function run(name:string,args:Record<string,unknown>):Promise<ActionState>{
  const client=await createClient();const {data:{user}}=await client.auth.getUser();
  if(!user)return {error:"Sign in to manage online bookings."};
  const {error}=await client.rpc(name,args);if(error)return {error:error.message};
  revalidatePath("/manage");return {success:true};
}
export async function decideOnlineRequest(_previous:ActionState,form:FormData):Promise<ActionState>{
  const approve=form.get("decision")==="approve";
  const deadline=String(form.get("deadline")??"");
  if(approve&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(deadline))return {error:"Choose the payment deadline you communicated to the guest."};
  return run("decide_online_request",{p_id:form.get("id"),p_approve:approve,p_deadline:approve?new Date(`${deadline}:00+01:00`).toISOString():null,p_note:form.get("note")});
}
export async function saveOnlineSettings(_previous:ActionState,form:FormData):Promise<ActionState>{
  const enabled=form.get("enabled")==="on";
  const arrival=form.get("arrival_requests")==="on";
  if(enabled&&(!process.env.SUPABASE_SECRET_KEY||!process.env.BOOKING_RATE_LIMIT_SECRET||!process.env.SITE_URL))return {error:"Configure the server connection, booking security secret and website address before enabling online bookings."};
  if(enabled&&!arrival&&!process.env.PAYSTACK_SECRET_KEY)return {error:"Configure Paystack, or allow pay-at-hotel requests, before enabling bookings."};
  return run("configure_dojworld_booking",{p_enabled:enabled,p_arrival_requests:arrival,p_policy:form.get("policy")});
}
export async function saveOnlineRoom(_previous:ActionState,form:FormData):Promise<ActionState>{
  return run("map_online_room",{p_slug:form.get("slug"),p_room_id:form.get("room_id"),p_enabled:form.get("enabled")==="on"});
}
export async function bulkOnlineRooms(_previous:ActionState,form:FormData):Promise<ActionState>{
  const slugs=[...new Set(form.getAll("slug").map(String))];
  const availability=form.get("availability");
  if(!slugs.length||slugs.length>200||slugs.some(slug=>!/^[-a-z0-9]{1,100}$/.test(slug)))return {error:"Select the rooms you want to update."};
  if(availability!=="enabled"&&availability!=="paused")return {error:"Choose whether to make the selected rooms available or pause them."};
  return run("bulk_set_online_rooms",{p_property_id:form.get("property_id"),p_slugs:slugs,p_enabled:availability==="enabled"});
}
export async function completeChannelTask(_previous:ActionState,form:FormData):Promise<ActionState>{
  const note=String(form.get("note")??"").trim();
  if(note.length<5||note.length>500)return {error:"Record what you checked or updated in Booking.com."};
  return run("complete_channel_inventory_task",{p_id:form.get("task_id"),p_expected_updated_at:form.get("updated_at"),p_note:note});
}
async function bookingStaff(propertyId:string) {
  const client=await createClient();const {data:{user}}=await client.auth.getUser();
  if(!user)throw new Error("Sign in to manage bookings.");
  // This RPC checks both role and property access before any privileged work starts.
  const {error}=await client.rpc("release_expired_online_bookings",{p_property_id:propertyId});
  if(error)throw new Error("Reception or management access to this hotel is required.");
  const {data:settings}=await client.from("dojworld_settings").select("property_id").eq("singleton",true).single();
  if(settings?.property_id!==propertyId)throw new Error("Choose the Dojworld property.");
  return client;
}
export async function processBookingTasks(_previous:ActionState,form:FormData):Promise<ActionState>{
  try {await bookingStaff(String(form.get("property_id")));await runBookingTasks();revalidatePath("/manage");return {success:true};}
  catch(error){return {error:error instanceof Error?error.message:"Booking updates could not complete."};}
}
export async function recheckBookingPayment(_previous:ActionState,form:FormData):Promise<ActionState>{
  try {
    const client=await bookingStaff(String(form.get("property_id")));
    const {data,error}=await client.from("online_bookings").select("payment_reference,payment_plan").eq("id",String(form.get("booking_id"))).eq("property_id",String(form.get("property_id"))).single();
    if(error||!data||data.payment_plan==="arrival")return {error:"Choose an online payment booking."};
    await verifyPayment(data.payment_reference);revalidatePath("/manage");return {success:true};
  }catch(error){return {error:error instanceof Error?error.message:"Payment could not be checked."};}
}
export async function recheckProviderRefund(_previous:ActionState,form:FormData):Promise<ActionState>{
  try {
    const client=await bookingStaff(String(form.get("property_id")));
    const {data,error}=await client.from("booking_provider_refunds").select("provider_id").eq("provider_id",String(form.get("provider_id"))).eq("property_id",String(form.get("property_id"))).single();
    if(error||!data)return {error:"Refund not found for this hotel."};
    await refreshProviderRefund(data.provider_id);revalidatePath("/manage");return {success:true};
  }catch(error){return {error:error instanceof Error?error.message:"Refund could not be checked."};}
}
export async function retryBookingEmail(_previous:ActionState,form:FormData):Promise<ActionState>{
  return run("retry_booking_notification",{p_id:form.get("notification_id")});
}
export async function recheckBookingRefunds(_previous:ActionState,form:FormData):Promise<ActionState>{
  try {
    const client=await bookingStaff(String(form.get("property_id")));
    const {data,error}=await client.from("online_bookings").select("payment_reference,payment_id").eq("id",String(form.get("booking_id"))).eq("property_id",String(form.get("property_id"))).single();
    if(error||!data?.payment_id)return {error:"Choose a verified online payment."};
    await refreshBookingRefunds(data.payment_reference);revalidatePath("/manage");return {success:true};
  }catch(error){return {error:error instanceof Error?error.message:"Refunds could not be checked."};}
}
