import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';

// Kept as base64 content for Resend's inline CID attachment — this project has no stable public
// hostname yet (no custom domain; a Vercel preview URL can change). Pre-resized to 96x96 (source
// logo.png is 1024x1024/475KB) so the email stays a reasonable size while the logo remains
// available to inboxes that block data URIs.
const LOGO_BASE64 = readFileSync(fileURLToPath(new URL('../assets/email-logo.png', import.meta.url))).toString('base64');

// Verification emails only — sent via Resend, from the backend exclusively. RESEND_API_KEY is
// read once per process from the environment (Render's Environment tab in production); never
// sent to or read by the frontend/Vite build. Previously Gmail API (OAuth 2.0), before that
// Resend — this is Resend again, swapped back in because Gmail's OAuth setup (Google Cloud
// Console project, consent screen, refresh token) was too much operational overhead for this
// project's needs.
const { RESEND_API_KEY, RESEND_FROM_EMAIL } = process.env;

const isConfigured = Boolean(RESEND_API_KEY);
const resend = isConfigured ? new Resend(RESEND_API_KEY) : null;

// A personal Gmail address (e.g. pakswangdu@gmail.com) can never be used here — Resend
// requires proving ownership of the FROM address's domain via DNS records, and nobody but
// Google can add DNS records for gmail.com. onboarding@resend.dev is Resend's own real,
// pre-verified testing sender, meant exactly for "no custom domain configured yet" — not an
// invented address. RESEND_FROM_EMAIL lets this become a real HarvestLink domain address
// later (e.g. "verify@harvestlink.app") the moment one is added and verified in the Resend
// dashboard, with no further code changes; until then it defaults to the testing sender.
const FROM_ADDRESS = `HarvestLink <${RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`;
// Sampled from the actual logo artwork (see BrandWordmark.jsx / globals.css's
// .brand-wordmark-harvest / .brand-wordmark-link on the frontend) — same two colors the
// wordmark uses everywhere in the product, not a separate palette invented for email.
const BRAND_HARVEST = '#3d7237';
const BRAND_LINK = '#184a76';
const TEXT_DARK = '#111827';
const TEXT_BODY = '#374151';
const TEXT_MUTED = '#6b7280';
const TEXT_FAINT = '#9ca3af';
const LINE = '#e5e7eb';
const CODE_BG = '#fafaf9';
const PAGE_BG = '#f3f4f6';
// Arial is the closest dependable match for the Inter wordmark in inboxes where web fonts
// are unavailable; keeping this stack explicit prevents clients from substituting a serif font.
const FONT_STACK = "Arial, Helvetica, 'Segoe UI', sans-serif";

// Purely a DISPLAY transform for the emailed HTML/text — "482913" -> "4 8 2 9 1 3". The `code`
// argument itself (what's hashed, stored, and compared against on verify) is never touched,
// and the digits are never reordered — nothing here can desync from what the user actually
// has to type back in.
function spacedDigits(code) {
  return String(code).split('').join(' ');
}

// Table-based layout with fully inline CSS throughout — no <style> block, no external fonts,
// no JS — this is what actually survives most email clients' HTML sanitizers intact, not a
// stylistic choice. width="100%" + max-width together is the standard fluid-table pattern for
// a card that fills a phone screen but caps at 480px on desktop, without needing @media
// queries (which several major email clients still strip).
function verificationEmailHtml(code) {
  const displayCode = spacedDigits(code);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Verify your HarvestLink account</title>
  </head>
  <body style="margin:0; padding:0; background-color:${PAGE_BG};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${PAGE_BG};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:100%; max-width:480px; background-color:#ffffff; border:1px solid ${LINE}; border-radius:10px;">
            <tr>
              <td style="padding:28px 32px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="30" valign="middle" style="width:30px;">
                      <img src="cid:harvestlink-logo" width="30" height="30" alt="HarvestLink" style="display:block; width:30px; height:30px; border:0;" />
                    </td>
                    <td width="8" style="width:8px;"></td>
                    <td valign="middle">
                      <span style="display:block; font-family:${FONT_STACK}; font-size:16px; font-weight:650; letter-spacing:-0.16px; line-height:1.2;">
                        <span style="color:${BRAND_HARVEST};">Harvest</span><span style="color:${BRAND_LINK};">Link</span>
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 4px; border-top:1px solid ${LINE};">
                <div style="height:28px; line-height:28px; font-size:1px;">&nbsp;</div>
                <p style="margin:0; font-family:${FONT_STACK}; font-size:15px; line-height:1.6; color:${TEXT_BODY};">Hi there,</p>
                <p style="margin:14px 0 0; font-family:${FONT_STACK}; font-size:15px; line-height:1.6; color:${TEXT_BODY};">
                  Here's the code to verify your email and finish setting up your HarvestLink account:
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 32px 6px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CODE_BG}; border:1px solid ${LINE}; border-radius:8px;">
                  <tr>
                    <td align="center" style="padding:18px 16px;">
                      <span style="font-family:'Courier New', Courier, monospace; font-size:28px; font-weight:700; letter-spacing:6px; color:${TEXT_DARK};">${displayCode}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 32px 32px;">
                <p style="margin:0; font-family:${FONT_STACK}; font-size:13px; line-height:1.6; color:${TEXT_MUTED};">
                  This expires in 10 minutes. Didn't try to sign up for HarvestLink? You can ignore this email — no account gets created without the code above.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px; border-top:1px solid ${LINE};">
                <p style="margin:0; font-family:${FONT_STACK}; font-size:12px; color:${TEXT_FAINT};">HarvestLink &middot; Cebu Farm-To-Market</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function verificationEmailText(code) {
  return [
    'HarvestLink',
    '',
    'Hi there,',
    '',
    "Here's the code to verify your email and finish setting up your HarvestLink account:",
    '',
    spacedDigits(code),
    '',
    "This expires in 10 minutes. Didn't try to sign up for HarvestLink? You can ignore this email — no account gets created without the code above.",
    '',
    'HarvestLink · Cebu Farm-To-Market',
  ].join('\n');
}

const isProduction = process.env.NODE_ENV === 'production';

// `email` is always the caller's own dynamic argument (register()/resendRegistrationCode() in
// auth.controller.js pass the address the user actually typed into the registration form) —
// never a hardcoded address, never read from a global, never the sender (FROM_ADDRESS) itself.
// In production this makes NO claim of success unless Resend's own response confirms it — no
// silent fallback there. If the send fails for any reason, this throws, and the caller is
// responsible for turning that into an honest error response rather than telling the user a
// code was sent when it wasn't. The one exception is local development with no RESEND_API_KEY
// configured (see the `!resend` branch below) — a deliberate, production-gated fallback, not
// an accidental one.
export async function sendVerificationCodeEmail(email, code) {
  // DEVELOPMENT-ONLY trace — confirms exactly which recipient this call used and what Resend
  // actually said back. Never logs the code, the API key, or any other secret; fully gated out
  // of production.
  if (!isProduction) console.info(`[dev-email-trace] Sending verification email to: ${email}`);

  if (!resend) {
    // RESEND_API_KEY isn't set. Production always requires a real key — this stays a hard
    // failure there, same as before. Outside production, print the code instead of emailing it
    // so registration can still be tested locally without a Resend account; the caller
    // (register()/resendRegistrationCode() in auth.controller.js) treats this as a normal
    // successful send.
    if (isProduction) {
      throw new Error('Email delivery is not configured (RESEND_API_KEY is missing).');
    }
    console.warn(`[dev-email-trace] Resend not configured — verification code for ${email}: ${code}`);
    return { devFallback: true };
  }

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: [email],
    subject: 'Verify your HarvestLink account',
    html: verificationEmailHtml(code),
    text: verificationEmailText(code),
    attachments: [
      {
        filename: 'harvestlink-logo.png',
        content: LOGO_BASE64,
        // Resend's Node SDK maps this camelCase field to the MIME content-id header.
        contentId: 'harvestlink-logo',
      },
    ],
  });

  if (error) {
    const reason = error?.message || 'Unable to send verification email.';
    if (!isProduction) console.info(`[dev-email-trace] Resend REJECTED the request for ${email}: ${reason}`);
    throw new Error(`Resend API error: ${reason}`, { cause: error });
  }

  if (!isProduction) console.info(`[dev-email-trace] Resend ACCEPTED the request for ${email} — id: ${data?.id}`);
  return data;
}
