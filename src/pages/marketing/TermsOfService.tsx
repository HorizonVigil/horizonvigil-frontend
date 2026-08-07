import { LegalPage } from './LegalPage';

export function TermsOfService() {
  return (
    <LegalPage title="Terms of Service" updated="August 2026">
      <section>
        <h2>1. Agreement</h2>
        <p>These terms govern your use of CloudOps360 (the "Service"). By creating an account, you agree to these terms on behalf of yourself and, if applicable, your organization.</p>
      </section>

      <section>
        <h2>2. The Service</h2>
        <p>CloudOps360 connects to cloud accounts you authorize (currently AWS and Google Cloud) and provides inventory, cost, security, and automation features on top of that data. Feature availability, included limits, and data retention vary by plan — see the pricing page for current details.</p>
      </section>

      <section>
        <h2>3. Accounts and organizations</h2>
        <p>You're responsible for the accuracy of information you provide and for maintaining the security of your login credentials. Organization owners are responsible for the roles and permissions they grant to other members within their organization.</p>
      </section>

      <section>
        <h2>4. Cloud account authorization</h2>
        <p>You represent that you have the authority to connect any cloud account or project you connect to CloudOps360, and to grant the permissions that connection requires. You can disconnect an account at any time; automation tied to that account stops immediately on disconnect.</p>
      </section>

      <section>
        <h2>5. Automation and remediation</h2>
        <p>Automation features (stop/start, right-sizing, and similar actions) only run when you explicitly enable them for a resource or policy. You're responsible for reviewing automation configuration before enabling it. Every automated action is recorded in your organization's audit log.</p>
      </section>

      <section>
        <h2>6. Billing</h2>
        <p>Paid plans are billed monthly or annually in advance, per the pricing shown at checkout. Plan changes take effect immediately for upgrades and at the next billing period for downgrades. You can cancel at any time from the billing portal; we don't offer prorated refunds for partial billing periods except where required by law.</p>
      </section>

      <section>
        <h2>7. Acceptable use</h2>
        <p>You agree not to use the Service to access cloud accounts you're not authorized to access, to circumvent rate limits or security controls, or to resell the Service without a separate written agreement with us.</p>
      </section>

      <section>
        <h2>8. Availability</h2>
        <p>We target the uptime SLA associated with your plan (see pricing) but the Service is provided without warranty of uninterrupted availability below Enterprise. We'll make reasonable efforts to notify you of planned maintenance.</p>
      </section>

      <section>
        <h2>9. Data ownership</h2>
        <p>You retain ownership of your cloud resource data and account information. We retain ownership of the CloudOps360 platform itself. On account termination, you may export your data before deletion per our Privacy Policy's retention terms.</p>
      </section>

      <section>
        <h2>10. Limitation of liability</h2>
        <p>The Service is provided "as is." To the maximum extent permitted by law, CloudOps360 is not liable for indirect, incidental, or consequential damages arising from use of the Service, including actions taken via automation features you configured.</p>
      </section>

      <section>
        <h2>11. Termination</h2>
        <p>You may terminate your account at any time. We may suspend or terminate accounts that violate these terms, with notice where practical.</p>
      </section>

      <section>
        <h2>12. Changes to these terms</h2>
        <p>We'll update the date at the top of this page when these terms change, and notify account owners by email for material changes.</p>
      </section>

      <section>
        <h2>13. Contact</h2>
        <p>Questions about these terms: <a href="mailto:legal@cloudops360.com" className="text-brand-600 dark:text-brand-400 hover:underline">legal@cloudops360.com</a></p>
      </section>
    </LegalPage>
  );
}
