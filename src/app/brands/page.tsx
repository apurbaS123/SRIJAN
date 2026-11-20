import Link from "next/link";
import { BrandLogos } from "@/components/BrandLogos";
import { BrandCallForm } from "./BrandCallForm";
import { CREATOR_SHARE } from "@/lib/domain/config";

/**
 * The page a paying brand lands on, and so the one that least deserved to be a spinner.
 *
 * Everything above the form is server-rendered. The form itself cannot be: the call slots it
 * offers are the next five working days, counted from the current time, which the server and the
 * browser disagree about — so it waits for the browser and says so. That gate used to sit at the
 * top of the whole page, which is why this page's HTML was the word "Loading…" and nothing else.
 *
 * What a brand wants to know before filling anything in — what the call is, what it costs, what
 * happens afterwards — is therefore here, in the markup, and readable with scripting off.
 */
export default function BrandsPage() {
  return (
    <>
      <div className="container page narrow">
        <span className="tag" style={{ background: "var(--violet)", color: "#fff", alignSelf: "flex-start" }}>
          For brands
        </span>
        <h1>Plan an influencer campaign with us</h1>
        <p className="muted">
          Book a free 30-minute call. A campaign manager handles everything after that — creator shortlist, contracts, content
          checks and the final report.
        </p>

        <section className="card stack">
          <h2>How a campaign runs</h2>
          <ol className="stack" style={{ margin: 0, paddingLeft: 20, gap: 8 }}>
            <li>
              <b>The call.</b> Thirty minutes, free, with a campaign manager. You describe the product, the market and roughly what
              you want to spend.
            </li>
            <li>
              <b>Proposal and shortlist.</b> Within three working days you get a named shortlist of creators, their deliverables
              and the fee for each.
            </li>
            <li>
              <b>Sign and pay half.</b> You sign online and pay 50% to start. The balance falls due when the campaign is settled.
            </li>
            <li>
              <b>You approve every post.</b> Nothing goes live until you have seen it. Creators keep{" "}
              {Math.round(CREATOR_SHARE * 100)}% of their fee and Srijan takes a commission on the campaign budget, agreed in the
              proposal.
            </li>
            <li>
              <b>Results report.</b> Reach, engagement and spend per creator at the end, in one document.
            </li>
          </ol>
          <p className="small muted">
            Creators are the same people in <Link href="/creators">the public directory</Link> — each one identity-checked by the
            Srijan team before they can take paid work. If you would rather book a single shoot than run a campaign, use{" "}
            <Link href="/book">the service menu</Link> instead; <Link href="/how-it-works">how it works</Link> covers both.
          </p>
        </section>

        <BrandCallForm />
      </div>
      <BrandLogos heading={false} />
    </>
  );
}
