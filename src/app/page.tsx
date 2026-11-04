"use client";
import { useMeta } from "@/components/useMeta";
import { GlassHero } from "@/components/GlassHero";

export default function Home() {
  const meta = useMeta();
  const from = meta ? Math.min(...meta.packages.map((p) => p.price)) : 799;

  return <GlassHero fromPrice={from} />;
}
