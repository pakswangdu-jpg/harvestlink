import LegalPageLayout from '../../components/legal/LegalPageLayout';

const LAST_UPDATED = 'August 2, 2026';

const SECTIONS = [
  {
    id: 'acceptance',
    title: 'Introduction and Acceptance of Terms',
    content: (
      <>
        <p>
          These Terms of Service (&quot;Terms&quot;) form a binding agreement between you and HarvestLink
          governing your access to and use of the HarvestLink platform (the &quot;Service&quot;) — a web-based
          marketplace connecting farmers, buyers, and partner organizations across Cebu for direct produce
          trading, delivery coordination, and surplus-produce donation.
        </p>
        <p>
          By creating an account, browsing the marketplace, placing or fulfilling an order, or otherwise using
          the Service, you agree to be bound by these Terms and by our{' '}
          <a href="/privacy-policy">Privacy Policy</a>, which is incorporated into these Terms by reference. If
          you are using the Service on behalf of an organization (for example, as a Partner Organization&apos;s
          authorized representative), you represent that you have the authority to bind that organization to
          these Terms.
        </p>
        <p>If you do not agree to these Terms, you must not access or use the Service.</p>
      </>
    ),
  },
  {
    id: 'eligibility-registration',
    title: 'Eligibility and Account Registration',
    content: (
      <>
        <p>
          HarvestLink supports four types of accounts: <strong>Farmer</strong>, <strong>Buyer</strong>,{' '}
          <strong>Stakeholder</strong> (partner organizations such as orphanages, elder-care homes, feeding
          programs, and NGOs), and <strong>Administrator</strong>. To create an account, you must provide
          accurate, current, and complete registration information.
        </p>
        <p>
          <strong>Farmer and Stakeholder accounts</strong> must be at least 18 years old (or otherwise be legally
          capable of entering into binding transactions under Philippine law) and authorized to act on behalf of
          any organization they represent, since these accounts sell products, handle payments, and hold a
          verified public profile. The 18-and-over requirement does <strong>not</strong> apply to{' '}
          <strong>Buyer accounts</strong> — a minor may hold and use a Buyer account (for example, to shop for a
          household), subject to a parent or guardian&apos;s awareness and consent.
        </p>
        <p>
          <strong>Farmer accounts</strong> are subject to admin verification, including review of a submitted
          government-issued ID or accreditation document, before the account may list products for sale.{' '}
          <strong>Stakeholder accounts</strong> are subject to similar review of the organization&apos;s
          accreditation. HarvestLink may approve, reject, or request additional information for any verification
          submission at its sole discretion.
        </p>
      </>
    ),
  },
  {
    id: 'account-responsibilities',
    title: 'Account Responsibilities',
    content: (
      <>
        <p>You are responsible for:</p>
        <ul>
          <li>Maintaining the confidentiality of your account password and any device on which you remain signed in.</li>
          <li>All activity that occurs under your account, whether or not you personally performed it.</li>
          <li>Keeping your profile information — including contact details, address, and (for Farmers) payment details — accurate and up to date.</li>
          <li>Notifying us immediately at the contact details in <a href="#contact-information">Contact Information</a> if you suspect unauthorized access to your account.</li>
        </ul>
        <p>HarvestLink is not liable for any loss arising from your failure to safeguard your account credentials.</p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable Use',
    content: (
      <>
        <p>You agree to use the Service only for its intended purpose — trading agricultural produce, coordinating delivery, and, where applicable, donating surplus produce — and to:</p>
        <ul>
          <li>Provide truthful, accurate information in your listings, orders, messages, ratings, and profile.</li>
          <li>Treat other users respectfully in messages, reviews, and all other interactions.</li>
          <li>Comply with all applicable Philippine laws and regulations, including consumer protection, food safety, and fair-pricing regulations.</li>
          <li>Use the AI-assisted features (price recommendations, demand forecasting, chat translation) as informational aids only, consistent with the disclaimer in <a href="#ai-disclaimer">AI-Generated Recommendations Disclaimer</a> below.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'prohibited-activities',
    title: 'Prohibited Activities',
    content: (
      <>
        <p>You must not, and must not attempt to:</p>
        <ul>
          <li>List, sell, or request products that are illegal, unsafe, counterfeit, or misrepresented (for example, describing a product&apos;s grade, quantity, or origin falsely).</li>
          <li>Circumvent HarvestLink&apos;s order, payment, or verification processes — for example, submitting falsified payment proof, fabricating a delivery booking, or arranging payment or delivery outside the Service to avoid platform safeguards.</li>
          <li>Harass, threaten, defraud, or impersonate another user, or post defamatory, obscene, or abusive content in messages or reviews.</li>
          <li>Submit fake ratings or reviews, or manipulate ratings through coordinated or automated activity.</li>
          <li>Upload malicious files, attempt to gain unauthorized access to any account or system, scrape or harvest data from the Service, or interfere with the Service&apos;s normal operation (including its security, availability, or the AI, mapping, payment-verification, and delivery-coordination features).</li>
          <li>Use another person&apos;s account, government ID, or accreditation document without authorization.</li>
          <li>Use the Service for any purpose that violates applicable law, including anti-money-laundering, consumer protection, or data privacy law.</li>
        </ul>
        <p>Violation of this section may result in content removal, order cancellation, and account suspension or termination as described in <a href="#suspension-termination">Account Suspension and Termination</a>.</p>
      </>
    ),
  },
  {
    id: 'listings-farmer-obligations',
    title: 'Product Listings and Farmer Obligations',
    content: (
      <>
        <p>As a Farmer, when you create a product listing you represent that:</p>
        <ul>
          <li>You are the lawful producer or seller of the listed product and have the right to sell it.</li>
          <li>The listed price, quantity, unit, grade, description, and photos accurately describe the product actually available.</li>
          <li>You will keep listed quantities reasonably up to date and will honor confirmed orders in good faith.</li>
          <li>Any cost price you record is for your own profit-tracking purposes and is never shown to buyers.</li>
        </ul>
        <p>
          Farmer accounts may be subject to DTI-related fair-pricing review for certain listings. A listing under
          review is not shown in the public marketplace until the review is resolved.
        </p>
      </>
    ),
  },
  {
    id: 'ai-disclaimer',
    title: 'AI-Generated Recommendations Disclaimer',
    content: (
      <>
        <p>
          HarvestLink provides AI-assisted price recommendations, demand forecasts, and chat translation as
          optional, informational tools. These outputs are generated automatically from available data (such as
          published commodity price references and historical order activity) and are provided{' '}
          <strong>&quot;as is,&quot; without warranty of any kind</strong>, including accuracy, completeness,
          reliability, or fitness for a particular purpose.
        </p>
        <p>
          You are solely responsible for any decision you make based on an AI-generated recommendation,
          forecast, or translation — including the price you list or agree to pay, the timing of a sale or
          harvest, and your understanding of a translated message. HarvestLink is not liable for any loss arising
          from reliance on these features. See our <a href="/privacy-policy#ai-recommendations">Privacy Policy</a>{' '}
          for more detail on how these tools work.
        </p>
      </>
    ),
  },
  {
    id: 'orders-pricing-payment',
    title: 'Order and Payment Policies',
    content: (
      <>
        <p>
          Placing an order through HarvestLink is an offer by the buyer to purchase the listed product at the
          listed price. An order is not binding on the farmer until the farmer confirms it; a farmer may decline
          an order (for example, if stock has changed) before confirming.
        </p>
        <h3>Pricing</h3>
        <p>All prices are set by the Farmer and displayed in Philippine Pesos (₱). Delivery fees, where applicable, are calculated automatically based on distance and displayed to the buyer before checkout. HarvestLink does not add its own markup to listed product prices.</p>
        <h3>Payment</h3>
        <p>
          Buyers may pay by Cash on Delivery or GCash, as described in our{' '}
          <a href="/privacy-policy#payment-processing">Privacy Policy</a>. For GCash orders, payment is not
          considered complete or verified until the farmer reviews and approves the buyer&apos;s submitted proof
          of payment within the Service. Submitting false or altered proof of payment is a material breach of
          these Terms and may result in immediate order cancellation and account suspension.
        </p>
        <h3>Cancellations</h3>
        <p>A buyer may cancel an order while it remains pending confirmation, or shortly after confirmation before it enters preparation, as reflected in the Service&apos;s own order-status rules at the time. Once an order has progressed further, cancellation is at the farmer&apos;s discretion.</p>
        <h3>Refunds and disputes</h3>
        <p>
          Because GCash payments are made directly between buyer and farmer (see{' '}
          <a href="/privacy-policy#payment-processing">Payment Processing</a>), any refund for a cancelled,
          rejected, or disputed GCash payment must be arranged directly between the buyer and farmer. HarvestLink
          is not a party to that payment and does not hold buyer funds in escrow. For Cash on Delivery orders, no
          refund obligation arises unless the order is not fulfilled. HarvestLink may assist in mediating a
          dispute reported to us, but is not obligated to and does not guarantee any particular resolution.
        </p>
      </>
    ),
  },
  {
    id: 'delivery-responsibilities',
    title: 'Delivery Responsibilities',
    content: (
      <>
        <p>Delivery responsibility depends on the delivery method the buyer selects at checkout:</p>
        <ul>
          <li><strong>Farmer delivery:</strong> the Farmer is responsible for delivering the order in the condition and timeframe reasonably communicated at checkout.</li>
          <li><strong>Buyer pickup:</strong> the Buyer is responsible for collecting the order from the Farmer&apos;s specified pickup location within a reasonable time after it is marked ready.</li>
          <li><strong>Third-party courier (Lalamove):</strong> the Farmer is responsible for booking the courier and accurately entering the resulting driver, vehicle, and tracking information into HarvestLink. Once an order is handed to the courier, <strong>the physical delivery, live tracking, and route are performed entirely by Lalamove</strong>, under Lalamove&apos;s own terms of service, not HarvestLink&apos;s. HarvestLink is not responsible for delays, loss, or damage occurring during Lalamove&apos;s handling of a delivery, and any such claim should be directed to Lalamove in accordance with its own policies.</li>
        </ul>
        <p>Buyers and farmers are encouraged to communicate promptly through in-app messaging regarding any delivery issue.</p>
      </>
    ),
  },
  {
    id: 'ratings-reviews',
    title: 'Ratings and Reviews',
    content: (
      <>
        <p>
          Buyers and Partner Organizations may rate and review a Farmer after confirming receipt of a completed
          order or donation. Reviews must reflect a genuine transaction and your honest experience. HarvestLink
          may remove a rating or review that violates <a href="#prohibited-activities">Prohibited Activities</a>{' '}
          above, but is not obligated to monitor every review and is not responsible for the opinions expressed
          in them.
        </p>
      </>
    ),
  },
  {
    id: 'messaging',
    title: 'Messaging and Communication',
    content: (
      <>
        <p>
          HarvestLink&apos;s in-app messaging is provided to support order coordination and donation requests
          between users. Messages may be automatically translated for your convenience; translations are provided
          &quot;as is&quot; per the <a href="#ai-disclaimer">AI-Generated Recommendations Disclaimer</a> above.
          You must not use messaging to send spam, unsolicited commercial content unrelated to a transaction, or
          content prohibited under <a href="#prohibited-activities">Prohibited Activities</a>.
        </p>
      </>
    ),
  },
  {
    id: 'intellectual-property',
    title: 'Intellectual Property',
    content: (
      <>
        <p>
          The HarvestLink name, logo, interface design, and underlying software are the property of HarvestLink
          and its licensors and are protected by applicable intellectual property law. You may not copy, modify,
          reverse-engineer, or create derivative works of the Service except as permitted by law.
        </p>
        <p>
          You retain ownership of the content you upload — product photos, listing descriptions, profile
          information, messages, and reviews. By uploading content, you grant HarvestLink a non-exclusive,
          royalty-free, worldwide license to host, display, reproduce, and distribute that content solely for the
          purpose of operating and promoting the Service (for example, showing your product listing in the
          marketplace, or a farmer&apos;s public profile page). You represent that you own or have the necessary
          rights to any content you upload.
        </p>
      </>
    ),
  },
  {
    id: 'third-party-services',
    title: 'Third-Party Services',
    content: (
      <>
        <p>
          The Service relies on and links to third-party services, including mapping and geocoding providers, AI
          service providers, and Lalamove for third-party courier delivery. These third parties operate under
          their own terms and privacy policies, which we encourage you to review. HarvestLink does not control
          and is not responsible for the acts, omissions, availability, or content of any third-party service. In
          particular, once an order is handed off to Lalamove for courier delivery, HarvestLink has no ability to
          alter, expedite, or guarantee the outcome of that delivery.
        </p>
      </>
    ),
  },
  {
    id: 'limitation-of-liability',
    title: 'Disclaimers and Limitation of Liability',
    content: (
      <>
        <p>
          The Service is provided <strong>&quot;as is&quot; and &quot;as available,&quot;</strong> without
          warranties of any kind, whether express or implied, including warranties of merchantability, fitness
          for a particular purpose, non-infringement, or that the Service will be uninterrupted, secure, or
          error-free.
        </p>
        <p>To the fullest extent permitted by applicable law, HarvestLink and its officers, employees, and affiliates shall not be liable for:</p>
        <ul>
          <li>The quality, safety, legality, or condition of any product listed or sold by a Farmer;</li>
          <li>Any act or omission of a Farmer, Buyer, Partner Organization, or third-party courier, including Lalamove;</li>
          <li>Any dispute between a Farmer and Buyer regarding payment, delivery, or product condition;</li>
          <li>Reliance on any AI-generated recommendation, forecast, or translation, as described in <a href="#ai-disclaimer">AI-Generated Recommendations Disclaimer</a>;</li>
          <li>Indirect, incidental, special, consequential, or punitive damages, or loss of profits, revenue, or data, arising from your use of the Service;</li>
        </ul>
        <p>
          To the extent any liability cannot be excluded under applicable Philippine law, HarvestLink&apos;s total
          aggregate liability for any claim arising out of or relating to the Service shall not exceed the total
          platform fees, if any, paid by you to HarvestLink in the twelve (12) months preceding the claim.
        </p>
      </>
    ),
  },
  {
    id: 'indemnification',
    title: 'Indemnification',
    content: (
      <>
        <p>
          You agree to indemnify and hold harmless HarvestLink and its officers, employees, and affiliates from
          any claim, liability, damage, loss, or expense (including reasonable legal fees) arising out of or
          related to: your use of the Service; your violation of these Terms; your violation of any law or the
          rights of a third party; or any product you list, sell, or purchase through the Service.
        </p>
      </>
    ),
  },
  {
    id: 'suspension-termination',
    title: 'Account Suspension and Termination',
    content: (
      <>
        <p>HarvestLink may suspend or terminate your account, in whole or in part, at our reasonable discretion, if we determine that you have:</p>
        <ul>
          <li>Violated these Terms, including the <a href="#prohibited-activities">Prohibited Activities</a> listed above;</li>
          <li>Provided false or misleading information during registration or verification;</li>
          <li>Engaged in fraudulent, abusive, or unsafe conduct toward another user; or</li>
          <li>Created risk or legal exposure for HarvestLink or other users.</li>
        </ul>
        <p>
          Where practical, we will notify you of the reason for suspension or termination. You may also delete
          your own account at any time from your Profile settings. Sections of these Terms that by their nature
          should survive termination — including <a href="#limitation-of-liability">Disclaimers and Limitation of
          Liability</a>, <a href="#indemnification">Indemnification</a>, and{' '}
          <a href="#intellectual-property">Intellectual Property</a> — will continue to apply after your account
          is closed.
        </p>
      </>
    ),
  },
  {
    id: 'governing-law',
    title: 'Governing Law and Dispute Resolution',
    content: (
      <>
        <p>
          These Terms are governed by the laws of the Republic of the Philippines, without regard to conflict-of-law
          principles. Any dispute arising out of or relating to these Terms or the Service shall first be
          addressed through good-faith negotiation between the parties. If a dispute cannot be resolved
          informally, it shall be subject to the exclusive jurisdiction of the appropriate courts of Cebu City,
          Philippines.
        </p>
      </>
    ),
  },
  {
    id: 'changes-to-terms',
    title: 'Changes to These Terms',
    content: (
      <>
        <p>
          We may revise these Terms from time to time to reflect changes to the Service or applicable law. If we
          make material changes, we will update the &quot;Last updated&quot; date above and, where appropriate,
          notify you through the Service before the changes take effect. Your continued use of HarvestLink after
          a revision takes effect constitutes your acceptance of the revised Terms. If you do not agree to a
          revision, you must stop using the Service and may close your account.
        </p>
      </>
    ),
  },
  {
    id: 'contact-information',
    title: 'Contact Information',
    content: (
      <>
        <p>Questions about these Terms can be directed to:</p>
        <ul>
          <li><strong>Email:</strong> <a href="mailto:hello@harvestlink.ph">hello@harvestlink.ph</a></li>
          <li><strong>Phone:</strong> <a href="tel:+639455993970">0945 599 3970</a></li>
          <li><strong>Office:</strong> Cebu City, Philippines</li>
          <li><strong>Business hours:</strong> Monday – Saturday, 8:00 AM – 6:00 PM (PHT)</li>
        </ul>
      </>
    ),
  },
];

export default function TermsOfService() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      lastUpdated={LAST_UPDATED}
      intro={(
        <p>
          These Terms govern your use of HarvestLink. Please read them carefully — they cover your
          responsibilities as a Farmer, Buyer, or Partner Organization, and how orders, payments, and deliveries
          are handled on the platform. Use the table of contents to jump to any section.
        </p>
      )}
      sections={SECTIONS}
    />
  );
}
