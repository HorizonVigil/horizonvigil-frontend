import { LegalPage } from './LegalPage';

export function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy" updated="August 2026">
      <section>
        <h2>1. What this covers</h2>
        <p>This policy describes how HorizonVigil ("we", "us") collects, uses, and protects information when you use the HorizonVigil platform — the website, the application, and the APIs behind it.</p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <p>We collect information in three ways:</p>
        <ul>
          <li><strong>Account information</strong> you provide directly: name, email address, and organization details when you sign up.</li>
          <li><strong>Cloud connection metadata</strong> you provide when connecting an AWS account or GCP project: account/project identifiers and connection credentials. Credentials are encrypted at rest (AES-GCM) before storage and are never logged in plaintext.</li>
          <li><strong>Resource and usage data</strong> we retrieve from your connected cloud accounts on your behalf — resource inventory, cost data, and security findings — solely to display it back to you inside the product.</li>
        </ul>
      </section>

      <section>
        <h2>3. How we use information</h2>
        <p>We use collected information to operate the platform: authenticating you, displaying your connected accounts' data, sending product and billing notifications you'd reasonably expect, and improving the reliability of the service. We do not sell personal information.</p>
      </section>

      <section>
        <h2>4. Cloud account access</h2>
        <p>When you connect an AWS account or GCP project, you grant HorizonVigil read access (and, only where you explicitly enable automation, limited write access for specific remediation actions) scoped to the permissions you configure. We never request broader access than a module needs to function, and every automated action is recorded in your organization's audit log.</p>
      </section>

      <section>
        <h2>5. Data retention</h2>
        <p>Resource, cost, and finding history is retained according to your plan's data-retention window (see the pricing page). Account information is retained for as long as your account is active, and deleted or anonymized within a reasonable period after account closure, except where we're required to retain it for legal or billing purposes.</p>
      </section>

      <section>
        <h2>6. Data sharing</h2>
        <p>We share data with subprocessors only as needed to run the service — for example, our database and infrastructure providers, and, if you subscribe to a paid plan, our payment processor. We do not share your cloud resource data with third parties for advertising purposes.</p>
      </section>

      <section>
        <h2>7. Your rights</h2>
        <p>You can access, export, or delete your account data at any time from within the product, or by contacting us. Disconnecting a cloud account immediately stops further data collection from it; historical data already retrieved remains subject to your plan's retention window unless you request earlier deletion.</p>
      </section>

      <section>
        <h2>8. Security</h2>
        <p>Access to the platform is protected by authenticated, organization-scoped permissions enforced at the database layer. Cloud credentials are encrypted at rest. See our Security & Compliance section on the homepage for more detail on specific controls by plan.</p>
      </section>

      <section>
        <h2>9. Changes to this policy</h2>
        <p>We'll update the date at the top of this page when this policy changes, and, for material changes, notify account owners by email.</p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>Questions about this policy: <a href="mailto:privacy@horizonvigil.com" className="text-brand-600 dark:text-brand-400 hover:underline">privacy@horizonvigil.com</a></p>
      </section>
    </LegalPage>
  );
}
