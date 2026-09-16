import { LegalPage } from './LegalPage';

const PRIVACY_EMAIL = 'privacy@horizonvigil.com';

export function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="August 2026"
    >
      <section aria-labelledby="privacy-scope">
        <h2 id="privacy-scope">1. What this covers</h2>
        <p>
          This policy describes how HorizonVigil ("we", "us") collects, uses,
          and protects information when you use the HorizonVigil platform —
          including the website, application, and APIs behind it.
        </p>
      </section>

      <section aria-labelledby="privacy-information">
        <h2 id="privacy-information">2. Information we collect</h2>

        <p>We collect information in three ways:</p>

        <ul>
          <li>
            <strong>Account information</strong> you provide directly, such as
            your name, email address, and organization details when you sign
            up.
          </li>

          <li>
            <strong>Cloud connection metadata</strong> you provide when
            connecting an AWS account or GCP project, such as account or
            project identifiers and connection credentials. Cloud credentials
            are encrypted at rest and are not intentionally written to
            application logs in plaintext.
          </li>

          <li>
            <strong>Resource and usage data</strong> retrieved from your
            connected cloud accounts on your behalf, including resource
            inventory, cost data, and security findings, for operating and
            displaying the relevant functionality within the platform.
          </li>
        </ul>
      </section>

      <section aria-labelledby="privacy-use">
        <h2 id="privacy-use">3. How we use information</h2>

        <p>
          We use collected information to operate and provide the platform,
          including authenticating users, displaying data from connected
          accounts, sending product and billing notifications you would
          reasonably expect, maintaining service reliability, and improving
          the service. We do not sell personal information.
        </p>
      </section>

      <section aria-labelledby="privacy-cloud-access">
        <h2 id="privacy-cloud-access">4. Cloud account access</h2>

        <p>
          When you connect an AWS account or GCP project, HorizonVigil accesses
          that environment according to the credentials, permissions, and
          configuration you provide. Where automation or remediation features
          are enabled, any additional permissions and resulting cloud actions
          are limited by the configuration and permissions granted to
          HorizonVigil.
        </p>

        <p>
          HorizonVigil is designed to request only the permissions required by
          the enabled functionality. Cloud access and application actions are
          subject to the permissions and controls configured for your
          organization.
        </p>
      </section>

      <section aria-labelledby="privacy-retention">
        <h2 id="privacy-retention">5. Data retention</h2>

        <p>
          Resource, cost, and finding history is retained according to your
          plan's applicable data-retention window. Account information is
          retained for as long as your account is active and may be deleted or
          anonymized after account closure, subject to applicable legal,
          regulatory, security, dispute-resolution, and billing requirements.
        </p>

        <p>
          Disconnecting a cloud account stops HorizonVigil from making further
          collection requests using that connection. Data already collected
          may remain available according to the applicable retention period
          unless you request deletion or another retention period applies.
        </p>
      </section>

      <section aria-labelledby="privacy-sharing">
        <h2 id="privacy-sharing">6. Data sharing</h2>

        <p>
          We may share information with service providers and subprocessors
          where reasonably necessary to operate the platform. These may
          include database, hosting, infrastructure, communications, analytics,
          and payment providers, depending on the services and plan you use.
        </p>

        <p>
          We do not share your cloud resource data with third parties for
          advertising purposes.
        </p>
      </section>

      <section aria-labelledby="privacy-rights">
        <h2 id="privacy-rights">7. Your rights</h2>

        <p>
          Depending on applicable law and your circumstances, you may have
          rights to access, correct, export, or delete personal information.
          You can use available product controls or contact us to make a
          request.
        </p>

        <p>
          Disconnecting a cloud account stops further collection from that
          connection. Previously collected data remains subject to the
          applicable retention period unless it is deleted earlier in
          accordance with our policies and applicable law.
        </p>
      </section>

      <section aria-labelledby="privacy-security">
        <h2 id="privacy-security">8. Security</h2>

        <p>
          HorizonVigil uses technical and organizational safeguards designed
          to protect information, including authenticated access controls,
          organization-scoped authorization, database-level access controls,
          and encryption for stored cloud credentials.
        </p>

        <p>
          Security controls and available features may vary by product plan
          and deployment configuration. See the Security &amp; Compliance
          information on our website for additional details.
        </p>
      </section>

      <section aria-labelledby="privacy-changes">
        <h2 id="privacy-changes">9. Changes to this policy</h2>

        <p>
          We will update the date at the top of this page when this policy
          changes. For material changes, we may provide additional notice,
          including by email to account owners where appropriate.
        </p>
      </section>

      <section aria-labelledby="privacy-contact">
        <h2 id="privacy-contact">10. Contact</h2>

        <p>
          Questions about this policy:{' '}
          <a
            href={`mailto:${PRIVACY_EMAIL}`}
            className="text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
          >
            {PRIVACY_EMAIL}
          </a>
        </p>
      </section>
    </LegalPage>
  );
}