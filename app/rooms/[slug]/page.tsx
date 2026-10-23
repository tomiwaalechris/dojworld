import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DojworldWebsite } from "@/components/dojworld-website";
import { rooms, roomSlug } from "@/lib/dojworld";
export function generateStaticParams() { return rooms.map(room => ({ slug: roomSlug(room) })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const room = rooms.find(room => roomSlug(room) === slug);
  return { title: `${room?.name ?? "Room not found"} | DOJ World Suites`, description: room?.description };
}
export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const room = rooms.find(room => roomSlug(room) === slug);
  if (!room) notFound();
  return <DojworldWebsite page="room" room={room}/>;
}
