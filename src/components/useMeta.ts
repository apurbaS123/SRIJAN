"use client";
import { useData } from "@/lib/client/api";
import type { City, ShootPackage } from "@/lib/domain/config";
import type { CampaignStage, ServiceKey } from "@/lib/domain/types";

export interface Meta {
  packages: ShootPackage[];
  cities: City[];
  services: { key: ServiceKey; label: string }[];
  gstRate: number;
  creatorShare: number;
  dispatch: { minNoticeMs: number; firstStartHour: number; lastStartHour: number; initialRadiusKm: number; widenedRadiusKm: number; broadcastWindowMs: number };
  freeRevisions: number;
  campaignStages: { key: CampaignStage; label: string }[];
  campaignCommission: { min: number; max: number; default: number };
  payout: { minWithdrawal: number; instantFee: number };
}

export function useMeta() {
  return useData<Meta>("/api/meta").data;
}
