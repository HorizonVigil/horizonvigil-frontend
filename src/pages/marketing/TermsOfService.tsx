import { LegalPage } from './LegalPage';

const LEGAL_EMAIL = 'legal@horizonvigil.com';

export function TermsOfService() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="August 2026"
    >
      <section aria-labelledby="terms-agreement">
        <h2 id="terms-agreement">1. Agreement</h2>
        <p>
          These Terms of Service govern your use of HorizonVigil (the
          "Service"). By creating an account or using the Service, you agree
          to these terms on behalf of yourself and, if applicable, the
          organization you represent.
        </p>
      </section>

      <section aria-labelledby="terms-service">
        <h2 id="terms-service">2. The Service</h2>
        <p>
          HorizonVigil connects to cloud accounts and projects that you
          authorize and provides inventory, cost, security, reporting, and
          related automation features based on the data and permissions
          available through those connections.
        </p>
        <p>
          Supported providers, features, included usage limits, and data
          retention periods may vary by plan and may change over time. Current
          plan details are described on the pricing page and, where
          applicable, in your order or subscription agreement.
        </p>
      </section>

      <section aria-labelledby="terms-accounts">
        <h2 id="terms-accounts">3. Accounts and organizations</h2>
        <p>
          You are responsible for the accuracy of the information you provide
          and for maintaining the security of your account credentials.
        </p>
        <p>
          Organization owners and administrators are responsible for the
          users, roles, permissions, and access they configure within their
          organization.
        </p>
      </section>

      <section aria-labelledby="terms-cloud-access">
        <h2 id="terms-cloud-access">4. Cloud account authorization</h2>
        <p>
          You represent that you have the authority to connect each cloud
          account or project you connect to HorizonVigil and to grant the
          permissions required for the applicable functionality.
        </p>
        <p>
          You may disconnect a cloud account or project at any time.
          Disconnecting a connection prevents HorizonVigil from making further
          requests through that connection, subject to any already-running
          operations and applicable provider behavior.
        </p>
      </section>

      <section aria-labelledby="terms-automation">
        <h2 id="terms-automation">5. Automation and remediation</h2>
        <p>
          Where automation or remediation functionality is available, it
          operates according to the configuration, permissions, and controls
          you provide. You are responsible for reviewing automation
          configurations and the permissions granted to HorizonVigil before
          enabling or approving automated actions.
        </p>
        <p>
          Automation availability and supported actions may vary by plan,
          provider, resource type, and deployment configuration. Where the
          Service records an automation event, that event may be available in
          the organization's audit history.
        </p>
      </section>

      <section aria-labelledby="terms-billing">
        <h2 id="terms-billing">6. Billing</h2>
        <p>
          Paid plans are billed according to the billing interval, pricing,
          usage limits, and other terms presented at checkout or in your
          applicable subscription agreement.
        </p>
        <p>
          Unless otherwise stated, upgrades take effect according to the
          applicable billing system and downgrades take effect at the next
          applicable billing period. You may cancel your subscription through
          the available billing controls. Refunds, credits, and prorated
          charges are handled according to the applicable subscription terms
          and applicable law.
        </p>
      </section>

      <section aria-labelledby="terms-acceptable-use">
        <h2 id="terms-acceptable-use">7. Acceptable use</h2>
        <p>
          You agree not to use the Service to access cloud accounts or
          resources that you are not authorized to access, circumvent
          applicable rate limits or security controls, interfere with the
          operation of the Service, or resell the Service without a separate
          written agreement with HorizonVigil.
        </p>
      </section>

      <section aria-labelledby="terms-availability">
        <h2 id="terms-availability">8. Availability</h2>
        <p>
          We aim to provide reliable access to the Service. Availability
          commitments, service levels, and remedies, if any, depend on your
          applicable plan or subscription agreement.
        </p>
        <p>
          We may perform planned maintenance, updates, or other operational
          work that temporarily affects availability. Where reasonably
          practical, we will provide advance notice of material planned
          maintenance.
        </p>
      </section>

      <section aria-labelledby="terms-data-ownership">
        <h2 id="terms-data-ownership">9. Data ownership</h2>
        <p>
          As between you and HorizonVigil, you retain your rights in data that
          you provide to the Service or that HorizonVigil retrieves from cloud
          environments you authorize, subject to the rights necessary for us
          to provide the Service.
        </p>
        <p>
          HorizonVigil retains all rights in the Service, including its
          software, interfaces, documentation, and underlying technology,
          except for rights that belong to you or other third parties.
        </p>
        <p>
          Following account termination, data may remain available for the
          applicable retention period and may be exported using available
          product functionality before deletion, subject to our Privacy Policy
          and applicable legal or contractual requirements.
        </p>
      </section>

      <section aria-labelledby="terms-liability">
        <h2 id="terms-liability">10. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by applicable law, the Service is
          provided on an "as is" and "as available" basis, without warranties
          except those expressly provided in an applicable written agreement.
        </p>
        <p>
          To the maximum extent permitted by applicable law, HorizonVigil will
          not be liable for indirect, incidental, special, consequential, or
          punitive damages arising from or related to your use of the Service,
          including consequences resulting from cloud configurations,
          permissions, or automation actions that you authorize or configure.
        </p>
      </section>

      <section aria-labelledby="terms-termination">
        <h2 id="terms-termination">11. Termination</h2>
        <p>
          You may terminate your account or subscription in accordance with the
          applicable billing and subscription terms.
        </p>
        <p>
          We may suspend or terminate access where reasonably necessary,
          including for material violations of these terms, security risks,
          fraud, non-payment, or misuse of the Service. Where practical and
          legally permitted, we will provide notice before taking such action.
        </p>
      </section>

      <section aria-labelledby="terms-changes">
        <h2 id="terms-changes">12. Changes to these terms</h2>
        <p>
          We may update these terms from time to time. We will update the date
          displayed at the top of this page when changes are made.
        </p>
        <p>
          For material changes, we may provide additional notice, including by
          email to account owners where appropriate.
        </p>
      </section>

      <section aria-labelledby="terms-contact">
        <h2 id="terms-contact">13. Contact</h2>
        <p>
          Questions about these terms:{' '}
          <a
            href={`mailto:${LEGAL_EMAIL}`}
            className="text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
          >
            {LEGAL_EMAIL}
          </a>
        </p>
      </section>
    </LegalPage>
  );
}