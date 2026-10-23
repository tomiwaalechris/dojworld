export const bookingChannels = [
  { value: "direct", label: "Walk-in / reception" },
  { value: "phone", label: "Phone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "booking_com", label: "Booking.com" },
  { value: "other", label: "Other booking channel" },
] as const;

export type BookingChannel = typeof bookingChannels[number]["value"];
export type ChannelCollection = "unknown" | "pay_at_hotel" | "collected_by_channel";

export function channelLabel(source?: string, name?: string | null) {
  if (source === "website") return "Hotel website";
  if (source === "other") return name || "Other channel";
  return bookingChannels.find(channel => channel.value === source)?.label ?? source ?? "Reception";
}

export function channelDetailsError(source: string, reference: string, unit: string, name: string, collection: string) {
  if (!bookingChannels.some(channel => channel.value === source)) return "Choose where the booking came from.";
  if (reference.length > 100 || unit.length > 100 || name.length > 80) return "Keep channel references within 100 characters and the channel name within 80.";
  if (source === "booking_com" && !reference.trim()) return "Enter the Booking.com reservation number.";
  if (source === "other" && name.trim().length < 2) return "Enter the booking channel name.";
  if (!["unknown", "pay_at_hotel", "collected_by_channel"].includes(collection)) return "Choose how payment is being collected.";
  if (source !== "booking_com" && source !== "other" && collection !== "unknown") return "Channel collection applies only to external bookings.";
  return undefined;
}
