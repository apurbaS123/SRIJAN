import { NextResponse } from "next/server";
import {
  CAMPAIGN_COMMISSION,
  CAMPAIGN_STAGES,
  CITIES,
  CREATOR_SHARE,
  DISPATCH,
  PACKAGES,
  SERVICES,
} from "@/lib/domain/config";

/** Static settings the screens need (packages, cities, rules). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      packages: PACKAGES,
      cities: CITIES,
      services: SERVICES,
      creatorShare: CREATOR_SHARE,
      dispatch: DISPATCH,
      campaignStages: CAMPAIGN_STAGES,
      campaignCommission: CAMPAIGN_COMMISSION,
    },
    // No serverNow here: it comes from data routes.
  });
}
