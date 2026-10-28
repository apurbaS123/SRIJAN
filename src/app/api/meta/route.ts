import { NextResponse } from "next/server";
import {
  CAMPAIGN_COMMISSION,
  CAMPAIGN_STAGES,
  CITIES,
  CREATOR_SHARE,
  DISPATCH,
  FREE_REVISIONS,
  GST_RATE,
  PACKAGES,
  PAYOUT,
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
      gstRate: GST_RATE,
      creatorShare: CREATOR_SHARE,
      dispatch: DISPATCH,
      freeRevisions: FREE_REVISIONS,
      campaignStages: CAMPAIGN_STAGES,
      campaignCommission: CAMPAIGN_COMMISSION,
      payout: PAYOUT,
    },
    // No serverNow here: it comes from data routes, which include the demo clock.
  });
}
