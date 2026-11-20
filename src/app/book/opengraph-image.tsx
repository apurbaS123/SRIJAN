import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Book a service on Srijan";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ title: "Book a service", subtitle: "31 services at fixed prices, from ₹799. A verified creator accepts, you pay, and the job is theirs.", tag: "Book" });
}
