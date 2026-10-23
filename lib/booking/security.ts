import { createHmac, timingSafeEqual } from "node:crypto";
export function validPaystackSignature(raw: string, signature: string | null, secret: string) {
  if (!secret || !signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature,"hex"),createHmac("sha512",secret).update(raw).digest());
}
export function limitKey(value: string, secret: string) { return createHmac("sha256",secret).update(value).digest("hex"); }
