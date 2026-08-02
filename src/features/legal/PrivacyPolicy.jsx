import LegalPageLayout from '../../components/legal/LegalPageLayout';

const LAST_UPDATED = 'August 2, 2026';

const SECTIONS = [
  {
    id: 'introduction',
    title: 'Introduction',
    content: (
      <>
        <p>
          HarvestLink (&quot;HarvestLink,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates a web-based
          marketplace that connects farmers directly with buyers and partner organizations across Cebu. This
          Privacy Policy explains what personal information we collect through the HarvestLink platform (the
          &quot;Service&quot;), why we collect it, how it is used and protected, and the choices and rights you
          have over it.
        </p>
        <p>
          This Policy applies to everyone who creates an account or otherwise uses HarvestLink, including
          Farmers, Buyers, Partner Organizations (referred to in the Service as &quot;Stakeholders&quot; — for
          example orphanages, elder-care homes, feeding programs, and NGOs requesting surplus-produce
          donations), and Administrators. By creating an account or using the Service, you agree to the
          collection and use of information as described in this Policy. If you do not agree, please do not use
          HarvestLink.
        </p>
        <p>
          This Policy should be read together with our{' '}
          <a href="/terms-of-service">Terms of Service</a>, which governs your use of the Service more broadly.
        </p>
      </>
    ),
  },
  {
    id: 'information-we-collect',
    title: 'Information We Collect',
    content: (
      <>
        <p>We collect information in three ways: information you give us directly, information generated as you use the Service, and information collected automatically by your device and browser.</p>

        <h3>1. Account and profile information</h3>
        <ul>
          <li>Full name, email address, contact number, and password (stored as a salted hash, never in plain text).</li>
          <li>Address, ZIP code, and municipality, used to calculate delivery distance and connect you with nearby farmers, buyers, and partner organizations.</li>
          <li>Profile photo, if you choose to upload one.</li>
          <li>Role-specific details: for Farmers, your farm name, birthday, and government-issued ID or accreditation document submitted for verification; for Partner Organizations, your organization name, organization type, and authorized contact person.</li>
          <li>GCash account name, GCash number, and GCash QR code image, if you are a Farmer who chooses to accept GCash payments.</li>
        </ul>

        <h3>2. Marketplace and transaction information</h3>
        <ul>
          <li>Product listings you create, including product name, category, grade, price, quantity, unit, description, photos, and recorded cost price.</li>
          <li>Orders you place or receive, including items purchased, quantities, prices, delivery method, delivery address, order status, and order history.</li>
          <li>Payment-related records, including payment method, GCash reference number, sender name, payment receipt images you upload, and payment verification status. See <a href="#payment-processing">Payment Processing</a> below for more detail.</li>
          <li>Donation activity, if you list, request, or fulfill a surplus-produce donation as a Farmer or Partner Organization.</li>
          <li>Ratings, star reviews, and written feedback you submit or receive.</li>
        </ul>

        <h3>3. Communications</h3>
        <ul>
          <li>Messages you send through HarvestLink&apos;s in-app messaging feature, including text, images, and file attachments, and whether a message has been read.</li>
          <li>Content you submit through the on-site contact form, which is sent to our support inbox via your own device&apos;s email client.</li>
        </ul>

        <h3>4. Location information</h3>
        <ul>
          <li>Your registered municipality and address, used to estimate delivery distance and fees, and to show nearby farmers, buyers, and partner organizations on in-app maps.</li>
          <li>Live GPS coordinates, but only when you actively enable location sharing during an active delivery or pickup trip you are personally responsible for. See <a href="#location-services">Location Services</a> below.</li>
        </ul>

        <h3>5. Device and usage information</h3>
        <ul>
          <li>Log data such as IP address, browser type, device type, and timestamps of requests to our servers.</li>
          <li>General usage information, such as which pages and features you interact with, used to keep the Service reliable and to improve it.</li>
          <li>Cookies and similar technologies. See <a href="#cookies">Cookies and Similar Technologies</a> below.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-we-use-information',
    title: 'How We Use Your Information',
    content: (
      <>
        <p>We use the information described above to:</p>
        <ul>
          <li>Create and maintain your account, verify your identity as a Farmer or Partner Organization, and authenticate your sign-ins.</li>
          <li>Operate the marketplace: display product listings, process orders, calculate delivery fees, and route messages between the correct buyer and farmer.</li>
          <li>Verify GCash payments you submit as proof of payment and notify the relevant farmer or buyer of the outcome.</li>
          <li>Coordinate delivery and pickup, including sharing the minimum location information necessary between a buyer and farmer for an active order, and directing buyers to our third-party courier partner&apos;s tracking page for courier-fulfilled orders.</li>
          <li>Generate AI-assisted price recommendations and demand forecasts, and provide AI-assisted chat translation, as described in <a href="#ai-recommendations">AI-Generated Recommendations Disclaimer</a> below.</li>
          <li>Send you transactional notifications — order updates, payment confirmations, delivery status changes, new messages, and account/verification status — through in-app notifications and, where applicable, email.</li>
          <li>Enable the ratings, reviews, and donation-matching features.</li>
          <li>Monitor, secure, and troubleshoot the Service, detect and prevent fraud or abuse, and enforce our <a href="/terms-of-service">Terms of Service</a>.</li>
          <li>Comply with applicable law, respond to lawful requests, and support DTI-related fair-pricing review processes described to Farmers within the Service.</li>
        </ul>
        <p>We do not sell your personal information, and we do not use your data to serve third-party advertising.</p>
      </>
    ),
  },
  {
    id: 'ai-recommendations',
    title: 'AI-Generated Recommendations Disclaimer',
    content: (
      <>
        <p>
          HarvestLink uses automated tools to help Farmers and Buyers make better decisions. These include an
          AI-assisted price recommendation engine, a demand-forecasting engine, and an AI-assisted chat
          translation feature. It is important to understand what these tools are — and are not.
        </p>
        <h3>What these tools do</h3>
        <ul>
          <li><strong>Price recommendations</strong> are computed from published reference data (such as PSA/DTI commodity prices), your own listing details, and market trend signals, to suggest a price range for a product.</li>
          <li><strong>Demand forecasts</strong> estimate likely buyer demand and the best time to sell or harvest a crop, based on historical order activity and seasonal patterns.</li>
          <li><strong>Chat translation</strong> automatically translates messages between languages so that farmers, buyers, and partner organizations who speak different languages can communicate.</li>
        </ul>
        <h3>What these tools are not</h3>
        <p>
          Every AI-generated recommendation, forecast, and translation is provided for informational purposes
          only. It is <strong>not</strong> financial, business, or professional advice, and it is <strong>not</strong>
          a guarantee of any outcome — including actual sale price, actual demand, actual weather conditions, or
          the precise meaning of a translated message. AI-assisted outputs can be inaccurate, outdated, or
          incomplete. Farmers remain solely responsible for the price they set and the products they list; buyers
          remain solely responsible for their purchasing decisions; and all parties remain responsible for
          confirming the meaning of any translated message before relying on it, particularly for order details,
          prices, or payment instructions.
        </p>
        <p>HarvestLink is not liable for losses arising from reliance on an AI-generated recommendation, forecast, or translation. See also <a href="/terms-of-service#limitation-of-liability">Limitation of Liability</a> in our Terms of Service.</p>
      </>
    ),
  },
  {
    id: 'payment-processing',
    title: 'Payment Processing',
    content: (
      <>
        <p>HarvestLink currently supports two payment methods, and we want to be precise about how each one actually works so you can make an informed decision about what information to share.</p>
        <h3>Cash on Delivery (COD)</h3>
        <p>For Cash on Delivery orders, no online payment data is collected — payment is exchanged in person between the buyer and the farmer or courier at the time of delivery or pickup, and the order is marked paid once delivery is confirmed.</p>
        <h3>GCash</h3>
        <p>
          For GCash orders, HarvestLink displays the farmer&apos;s own GCash account name, number, and QR code
          (which the farmer has voluntarily stored on their profile) so the buyer can pay the farmer directly
          through the buyer&apos;s own GCash mobile application. HarvestLink does <strong>not</strong> integrate
          with GCash, PayMongo, Xendit, or any other payment processor&apos;s API, and does not process, store, or
          have access to your GCash account credentials, PIN, one-time passwords, or full financial account
          details at any point.
        </p>
        <p>
          After paying, the buyer uploads a screenshot of the payment confirmation together with the GCash
          reference number, sender name, and payment date/time. This proof-of-payment information is stored on
          your order record and is visible to the farmer, who manually reviews and either approves or rejects it
          before the order is marked as paid. We retain uploaded receipt images and the reference details above
          as part of your order and transaction history.
        </p>
        <p>
          As HarvestLink grows, we may add integrations with licensed Philippine payment service providers
          (which may include providers such as PayMongo or Xendit) to process card and e-wallet payments
          directly. If and when such an integration is introduced, this Policy will be updated in advance to
          describe exactly what payment data that provider collects and how it is used, consistent with{' '}
          <a href="#changes-to-policy">Changes to This Privacy Policy</a> below.
        </p>
      </>
    ),
  },
  {
    id: 'delivery-tracking',
    title: 'Delivery Tracking',
    content: (
      <>
        <p>HarvestLink supports three delivery methods, each with a different data flow:</p>
        <ul>
          <li><strong>Farmer delivery</strong> — the farmer delivers the order personally. While an order is out for delivery, the farmer may share their live device location with the buyer through the Service so the buyer can watch the delivery approach on a map. This sharing is temporary, tied to that specific order, and automatically stops once the order is delivered or the farmer closes location sharing.</li>
          <li><strong>Buyer pickup</strong> — the buyer collects the order from the farmer. Once the order is ready for pickup, the buyer may similarly choose to share their own live location so the farmer can see them en route.</li>
          <li><strong>Third-party courier (Lalamove)</strong> — the farmer books the delivery directly through Lalamove&apos;s own website or app, outside of HarvestLink. The farmer then enters the resulting driver name, contact number, vehicle type, and Lalamove tracking link into HarvestLink so the buyer has a record of it. When the buyer taps &quot;Track Delivery,&quot; they are taken to Lalamove&apos;s own official tracking page in a new browser tab. HarvestLink does not implement, embed, or have access to Lalamove&apos;s live GPS tracking, courier assignment, or route data — that tracking happens entirely on Lalamove&apos;s own platform, governed by Lalamove&apos;s own privacy policy.</li>
        </ul>
        <p>Location data shared for delivery purposes is used only to facilitate that specific delivery and is not used for any other purpose, sold, or shared with anyone outside the two parties to that order.</p>
      </>
    ),
  },
  {
    id: 'location-services',
    title: 'Location Services',
    content: (
      <>
        <p>
          HarvestLink requests access to your device&apos;s precise location only when you take an action that
          requires it — for example, enabling live location sharing during an active delivery or pickup, or
          using a &quot;use my current location&quot; convenience feature when setting your address. Your browser
          will always show its own native permission prompt before any location data is accessed; HarvestLink
          cannot access your device&apos;s location without that explicit, browser-level permission.
        </p>
        <p>
          You may decline or revoke location permission at any time through your browser or device settings.
          Declining location access does not prevent you from using HarvestLink generally, but it will disable
          features that depend on it, such as live delivery tracking or automatic address detection.
        </p>
        <p>Live location is only ever shared with the other party to the specific order it relates to (the buyer or farmer on that order), never publicly, and never with unrelated third parties.</p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and Similar Technologies',
    content: (
      <>
        <p>HarvestLink uses a small number of strictly necessary browser storage mechanisms to operate the Service:</p>
        <ul>
          <li><strong>Authentication tokens</strong>, used to keep you signed in securely between visits.</li>
          <li><strong>Local preferences</strong>, such as your selected message-translation language, stored locally on your device.</li>
        </ul>
        <p>
          We do not use third-party advertising cookies or cross-site tracking cookies. If HarvestLink later adds
          analytics or marketing cookies, we will update this section and provide the relevant consent controls
          before doing so. You can control or clear cookies and local storage at any time through your browser
          settings, though doing so may sign you out of the Service.
        </p>
      </>
    ),
  },
  {
    id: 'data-sharing-third-parties',
    title: 'Third-Party Services',
    content: (
      <>
        <p>We share the minimum information necessary with the following categories of third parties, solely to operate the Service:</p>
        <ul>
          <li><strong>Infrastructure and hosting providers</strong> (database, authentication, file storage, and server hosting), who process data on our behalf under contractual confidentiality and security obligations.</li>
          <li><strong>Mapping, routing, and geocoding providers</strong> (used to display maps, estimate delivery distance, and calculate delivery fees), who receive municipality-level or address-level location data as needed to return a route or map tile.</li>
          <li><strong>Lalamove</strong>, for orders fulfilled by third-party courier, as described in <a href="#delivery-tracking">Delivery Tracking</a> above. HarvestLink shares only what the farmer manually enters (driver/vehicle/tracking details); we do not transmit your account data to Lalamove automatically.</li>
          <li><strong>AI service providers</strong>, used to generate price recommendations, demand forecasts, and message translations, as described in <a href="#ai-recommendations">AI-Generated Recommendations Disclaimer</a>. Only the data necessary to generate that specific output (for example, a product&apos;s category and price history, or the text of a message being translated) is sent.</li>
          <li><strong>Government and regulatory bodies</strong>, where required by law, such as in connection with DTI fair-pricing review processes referenced within the Service, or a valid legal request.</li>
        </ul>
        <p>We do not sell personal information to third parties, and we do not share your data with third parties for their own independent marketing purposes.</p>
      </>
    ),
  },
  {
    id: 'data-security',
    title: 'Data Security',
    content: (
      <>
        <p>We apply industry-standard safeguards to protect your information, including:</p>
        <ul>
          <li>Encryption of data in transit (HTTPS/TLS) between your browser and our servers.</li>
          <li>Password hashing — we never store your password in plain text, and HarvestLink staff cannot view it.</li>
          <li>Row-level access controls at the database layer, so accounts can only read and modify data they are actually authorized to access.</li>
          <li>Private storage buckets with signed, time-limited access links for sensitive documents such as government IDs and accreditation files, viewable only by the account that owns them and authorized administrators.</li>
          <li>Role-based access to administrative functions, restricted to verified Administrator accounts.</li>
        </ul>
        <p>
          No system can be guaranteed 100% secure. If we become aware of a data breach affecting your personal
          information, we will notify affected users and the National Privacy Commission as required by
          applicable law.
        </p>
      </>
    ),
  },
  {
    id: 'data-retention',
    title: 'Data Retention',
    content: (
      <>
        <p>
          We retain your account information for as long as your account remains active, and transaction records
          (orders, payments, receipts) for as long as reasonably necessary to comply with tax, accounting, and
          legal obligations, resolve disputes, and maintain accurate order history for both parties to a
          transaction — typically for the lifetime of the account plus a reasonable period afterward.
        </p>
        <p>
          If you delete your account, we will deactivate your profile and remove or anonymize personal
          information that is not otherwise required to be retained by law or needed to preserve the integrity
          of another user&apos;s order or transaction history (for example, an order a farmer fulfilled for you
          remains part of that farmer&apos;s own records).
        </p>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your Rights',
    content: (
      <>
        <p>
          Under the Philippine Data Privacy Act of 2012 and its implementing rules, you have the right to:
        </p>
        <ul>
          <li><strong>Access</strong> the personal information we hold about you.</li>
          <li><strong>Correct</strong> inaccurate or outdated information — most profile details can be updated directly from your Profile page.</li>
          <li><strong>Object to or restrict</strong> certain processing of your information.</li>
          <li><strong>Withdraw consent</strong> for optional features, such as location sharing, at any time.</li>
          <li><strong>Request deletion</strong> of your account and associated personal information, subject to the retention exceptions described in <a href="#data-retention">Data Retention</a> above.</li>
          <li><strong>Data portability</strong> — request a copy of your data in a commonly used format.</li>
          <li><strong>Lodge a complaint</strong> with the National Privacy Commission (NPC) if you believe your rights have been violated.</li>
        </ul>
        <p>To exercise any of these rights, contact us using the details in <a href="#contact-us">Contact Us</a> below. We will respond within the timeframe required by applicable law.</p>
      </>
    ),
  },
  {
    id: 'childrens-privacy',
    title: "Children's Privacy",
    content: (
      <>
        <p>
          Farmer and Stakeholder accounts on HarvestLink are intended for individuals who are at least 18 years
          old, or who otherwise have the legal capacity to enter into binding transactions under Philippine law
          (for example, as an authorized representative of a registered partner organization) — these account
          types sell products, handle payments, and hold a verified public profile.
        </p>
        <p>
          This age requirement does <strong>not</strong> apply to Buyer accounts: a minor may hold and use a
          Buyer account, for example to shop for a household, subject to a parent or guardian&apos;s awareness
          and consent. We otherwise do not knowingly collect personal information from children beyond what a
          Buyer account itself requires (see <a href="#information-we-collect">Information We Collect</a>). If we
          become aware that we have inadvertently collected information from a child in a way that exceeds this,
          we will take reasonable steps to delete it promptly.
        </p>
      </>
    ),
  },
  {
    id: 'international-transfers',
    title: 'International Data Transfers',
    content: (
      <>
        <p>
          Some of the infrastructure providers described in <a href="#data-sharing-third-parties">Third-Party
          Services</a> may store or process data on servers located outside the Philippines. Where this occurs,
          we take reasonable steps to ensure your information continues to receive a comparable level of
          protection to that required under Philippine data privacy law, including relying on providers that
          maintain recognized security and privacy certifications.
        </p>
      </>
    ),
  },
  {
    id: 'changes-to-policy',
    title: 'Changes to This Privacy Policy',
    content: (
      <>
        <p>
          We may update this Privacy Policy from time to time to reflect changes in the Service, our data
          practices, or applicable law. If we make material changes, we will update the &quot;Last updated&quot;
          date at the top of this page and, where appropriate, notify you through the Service or by email before
          the changes take effect. We encourage you to review this page periodically. Continued use of
          HarvestLink after a change takes effect constitutes acceptance of the revised Policy.
        </p>
      </>
    ),
  },
  {
    id: 'contact-us',
    title: 'Contact Us',
    content: (
      <>
        <p>If you have questions, concerns, or requests regarding this Privacy Policy or your personal information, please contact us:</p>
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

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      lastUpdated={LAST_UPDATED}
      intro={(
        <p>
          This page explains how HarvestLink collects, uses, and protects your personal information. Use the
          table of contents to jump to any section.
        </p>
      )}
      sections={SECTIONS}
    />
  );
}
