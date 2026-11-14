import type { Metadata } from "next";
import { creatorVerificationMode } from "@/lib/server/digilocker";

export const metadata: Metadata = { title: "Privacy policy", description: "What Srijan collects, why we collect it, how long we keep it and who we share it with." };

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
        {creatorVerificationMode() === "manual" ? (
          <li>
            Creator identity (KYC): to verify you, we keep the photos of both sides of the Aadhaar card you upload, the name printed
            on it, and the <strong>last 4 digits</strong> of your Aadhaar number. We also keep a scrambled, one-way form of the full
            number, used for nothing except noticing if the same Aadhaar is used to open a second account — the number itself is not
            stored and cannot be worked back out from it. Your documents are stored privately, are opened only by the Srijan team to
            verify you, and never appear on your public profile or anywhere a client can see.
          </li>
        ) : (
          <li>
            Creator identity (KYC): when you verify yourself through DigiLocker, we keep the name, date of birth and gender on your
            Aadhaar, the <strong>last 4 digits</strong> of your Aadhaar number, whether you hold a PAN card, and DigiLocker’s own id for
            you. Your full Aadhaar number is never sent to Srijan, and we don’t download or store any of your documents.
          </li>
        )}
        <li>Brand details: your brand name, contact details, campaign goals, regions and budget range.</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To run your account, confirm that creators are who they say they are, match bookings with creators, take payments, pay creators,
        send refunds, send you sign-in codes and updates, and resolve any problems with a job.
      </p>

      <h2>Who can see it</h2>
      <ul>
        <li>The client and creator on a job can see the contact details they need for that job.</li>
        <li>Creator profiles are shown publicly on the site, but bank details are not. Only the Srijan team can see those in full.</li>
        <li>The Srijan team can see account, booking and campaign details so that it can run the service.</li>
        {creatorVerificationMode() === "digilocker" && (
          <li>Your KYC details are seen only by the Srijan team, and only to confirm you are who you say you are. They are never shown on your public profile or to clients.</li>
        )}
      </ul>

      <h2>Services we rely on</h2>
      <ul>
        <li>Razorpay takes payments. You enter your card or UPI details with Razorpay, not on Srijan.</li>
        {creatorVerificationMode() === "digilocker" && (
          <li>
            DigiLocker (Government of India) verifies creators. You sign in to DigiLocker yourself and choose whether to share your
            Aadhaar details with Srijan; if you’d rather not, the Srijan team can verify you by hand instead.
          </li>
        )}
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
