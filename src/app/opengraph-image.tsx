import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Srijan — the creator economy of India";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ title: "Create it today.", subtitle: "Verified videographers, photographers, editors and influencers across India. Fixed prices, paid safely through Srijan." });
}
