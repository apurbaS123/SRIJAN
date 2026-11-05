import type { Metadata } from "next";

export const metadata: Metadata = { title: "About us — Srijan" };

export default function AboutPage() {
  return (
    <div className="container narrow page">
      <h1>About us</h1>
      <p>We looked at the creator economy in India and saw chaos. Endless negotiations. Unreliable deliveries. Payment anxiety.</p>
      <p>So we fixed it.</p>
      <p>Welcome to Srijan. We’ve turned creative brilliance into a seamless, on-demand experience. Verified creators. Standardized deliverables. Zero friction. It just works.</p>

      <h2>Mission</h2>
      <p>To make hiring creative talent as simple, beautiful, and reliable as buying a cup of coffee.</p>

      <h2>Vision</h2>
      <p>A completely frictionless creator economy. Where talent meets opportunity, instantly.</p>

      <h2>Services</h2>
      <p>We stripped away the noise and left only what you actually need:</p>
      <ol>
        <li>
          <b>Shoot.</b> Hyperlocal videographers and photographers at your door.
        </li>
        <li>
          <b>Edit.</b> Lightning-fast remote cuts and polish.
        </li>
        <li>
          <b>Design.</b> Pixels pushed to perfection, live.
        </li>
        <li>
          <b>Write &amp; Speak.</b> Words and voices that actually connect.
        </li>
        <li>
          <b>Amplify.</b> Social management and UGC that moves the needle.
        </li>
      </ol>
    </div>
  );
}
