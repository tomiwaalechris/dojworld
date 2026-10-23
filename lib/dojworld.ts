import roomPhotos from "./room-photos.json";

export const rooms = [
  { name: "Mambilla Plateau", category: "Deluxe", rate: 80000, image: "mambilla.png", photos: roomPhotos.mambilla, description: "A welcoming retreat with warm finishes and thoughtfully furnished spaces. Settle in and make yourself at home in the heart of Ikeja." },
  { name: "Tinapa Resort", category: "Deluxe", rate: 80000, image: "tinapa.jpg", photos: roomPhotos.tinapa, description: "Comfort, character, and everything you need to unwind. An inviting room for a Lagos escape or a productive business stay." },
  { name: "Ikogosi Springs", category: "Deluxe", rate: 80000, image: "ikogosi.png", photos: roomPhotos.ikogosi, description: "Named after the meeting of warm and cold springs in Ekiti, this room is your invitation to slow down and recharge." },
  { name: "Yankari Reserve", category: "Standard", rate: 70000, image: "yankari.png", photos: roomPhotos.yankari, description: "Inspired by Nigeria’s celebrated wilderness, a comfortable base for exploring Lagos, with the essentials for a restful stay." },
  { name: "Olumo Rock", category: "Executive", rate: 100000, image: "olumo.png", photos: roomPhotos.olumo, description: "A distinctive setting for a special stay. Elegant furnishings and contemporary comforts come together in our Executive room." },
  { name: "Zuma Rock", category: "Royalty", rate: 90000, image: "zuma.png", photos: roomPhotos.zuma, description: "Make room for a little indulgence. A characterful retreat named after one of Nigeria’s most recognisable natural landmarks." },
  { name: "Obudu Ranch", category: "Deluxe", rate: 80000, image: "obudu.png", photos: roomPhotos.obudu, description: "A little escape within the city. Discover a welcoming space inspired by the spirit of Nigeria’s beautiful highlands." },
] as const;
export type DojRoom = typeof rooms[number];
export const money = (amount: number) => `₦${amount.toLocaleString("en-NG")}`;

export const roomSlug = (room: DojRoom) => room.name.toLowerCase().replaceAll(" ", "-");
export const galleryPhotos = [
  { image: "facilities.jpg", label: "Welcome to DOJ World", category: "Facilities" },
  { image: "facilities-interior.png", label: "Around the hotel", category: "Facilities" },
  { image: "facilities-detail.png", label: "Hotel details", category: "Facilities" },
  { image: "restaurant.jpg", label: "The restaurant", category: "Restaurant & bar" },
  { image: "dining.jpg", label: "A place to dine", category: "Restaurant & bar" },
  { image: "bar.png", label: "Time to unwind", category: "Restaurant & bar" },
  { image: "lounge.jpg", label: "The bar at DOJ World", category: "Restaurant & bar" },
  ...rooms.flatMap(room => [{ image: room.image, label: room.name, category: "Rooms" }, ...room.photos.map((image, index) => ({ image, label: `${room.name} · View ${index + 2}`, category: "Rooms" }))]),
];
