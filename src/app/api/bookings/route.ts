import { api, readJson } from "@/lib/server/api";
import { assertRazorpayConfigured } from "@/lib/server/razorpay";
import { limitByIp } from "@/lib/server/rateLimit";
import { bookingAlertLines, sendOpsAlerts } from "@/lib/server/alerts";
import { bookingView } from "@/lib/domain/views";
import { createBookings, type NewOrderInput } from "@/lib/domain/bookings";

/** Clients see their bookings, creators their jobs, ops everything. */
export async function GET() {
  return api(
    ({ db, user, viewer }) => {
      const list =
        user!.role === "ops"
          ? db.bookings
          : user!.role === "creator"
            ? db.bookings.filter((b) => b.creatorId === user!.creatorId)
            : db.bookings.filter((b) => b.clientId === user!.id);
      return list.sort((a, b) => b.createdAt - a.createdAt).map((b) => bookingView(db, b, viewer));
    },
    { role: ["client", "creator", "ops"] },
  );
}

/**
 * Creates one job per service and starts looking for creators straight away. Nothing is charged
 * here: each job's price is asked for once a creator has accepted it (see /api/payments/order).
 */
export async function POST(req: Request) {
  const limited = await limitByIp("booking", 20, 60 * 60_000);
  if (limited) return limited;
  const input = await readJson<NewOrderInput>(req);
  let alerts: string[][] = [];
  const res = await api(
    ({ db, now, user, viewer }) => {
      // Without Razorpay nobody could ever pay for the job, so the booking isn't taken at all.
      assertRazorpayConfigured();
      const list = createBookings(db, user!.id, input, now);
      alerts = list.map((b) => bookingAlertLines(db, b));
      return { bookings: list.map((b) => bookingView(db, b, viewer)) };
    },
    { role: "client" },
  );
  if (res.ok) sendOpsAlerts(alerts);
  return res;
}
