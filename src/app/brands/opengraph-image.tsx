import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Run an influencer campaign with Srijan";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ title: "Plan a campaign with us", subtitle: "A free 30-minute call, a named creator shortlist in three working days, and you approve every post.", tag: "For brands" });
}
