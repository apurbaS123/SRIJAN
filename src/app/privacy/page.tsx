import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy — Srijan" };

export default function PrivacyPage() {
  return (
    <div className="container narrow page">
      <h1>Privacy policy</h1>
      <p>This page explains what Srijan collects, why, and who it’s shared with.</p>

      <h2>What we collect</h2>
      <ul>
        <li>Account details: your name, email address, mobile number and a protected form of your password.</li>
        <li>Booking details: the services you order, the time, the address for on-site jobs, your brief and the amount paid.</li>
        <li>Creator details: your profile, location, social media links, and the bank or UPI details we use to pay you.</li>
        <li>Brand details: your brand name, contact details, campaign goals, regions and budget range.</li>
      </ul>

      <h2>How we use it</h2>
      <p>To run your account, match bookings with creators, take payments, pay creators, send refunds, send you sign-in codes and updates, and resolve any problems with a job.</p>

      <h2>Who can see it</h2>
      <ul>
        <li>The client and creator on a job can see the contact details they need for that job.</li>
        <li>Creator profiles are shown publicly on the site, but bank details are not. Only the Srijan team can see those in full.</li>
        <li>The Srijan team can see account, booking and campaign details so that it can run the service.</li>
      </ul>

      <h2>Services we rely on</h2>
      <ul>
        <li>Razorpay takes payments. You enter your card or UPI details with Razorpay, not on Srijan.</li>
        <li>Vercel hosts the site and Supabase stores its data.</li>
        <li>Brevo sends our emails.</li>
        <li>OpenStreetMap provides the map you use to choose a location.</li>
      </ul>

      <h2>Cookies</h2>
      <p>We use a cookie to keep you signed in.</p>

      <h2>Your choices</h2>
      <p>You can ask the Srijan team to correct or delete your details. We may need to keep some records of payments and bookings.</p>

      <h2>Changes</h2>
      <p>We may update this policy. The version on this page is the one that applies.</p>
    </div>
  );
}
