"use client";
import { useData } from "@/lib/client/api";
import type { City, ShootPackage } from "@/lib/domain/config";
import type { CampaignStage, ServiceKey } from "@/lib/domain/types";

export interface Meta {
  packages: ShootPackage[];
  cities: City[];
  services: { key: ServiceKey; label: string }[];
  creatorShare: number;
  dispatch: { onSiteNoticeMs: number; maxDaysAhead: number; firstStartHour: number; lastStartHour: number; initialRadiusKm: number; widenedRadiusKm: number; broadcastWindowMs: number };
  campaignStages: { key: CampaignStage; label: string }[];
  campaignCommission: { min: number; max: number; default: number };
}

export function useMeta() {
  return useData<Meta>("/api/meta").data;
}
