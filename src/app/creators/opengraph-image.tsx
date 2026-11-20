import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Verified creators on Srijan";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ title: "Hire a verified creator", subtitle: "Every profile identity-checked by the Srijan team before they can take paid work.", tag: "Creators" });
}
