import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';

// Embedded as a base64 data URI rather than linked by URL — this project has no stable public
// hostname yet (no custom domain; a Vercel preview URL can change), and a data URI works in
// every recipient's inbox (Gmail included, which is all this project targets) without
// depending on any external host staying up. Pre-resized to 96x96 (source logo.png is
// 1024x1024/475KB — far too large to embed) so the email stays a reasonable size.
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
const BRAND_GREEN = '#166534';
const BRAND_GREEN_SOFT = '#f0fdf4';
const BRAND_GREEN_LINE = '#dcfce7';
const TEXT_DARK = '#111827';
const TEXT_BODY = '#374151';
const TEXT_MUTED = '#6b7280';
const TEXT_FAINT = '#9ca3af';
const LINE = '#e5e7eb';
const PAGE_BG = '#f3f4f6';
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
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:100%; max-width:480px; background-color:#ffffff; border:1px solid ${LINE}; border-radius:12px;">
            <tr>
              <td align="center" style="padding:36px 32px 28px; border-bottom:1px solid ${LINE};">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="52" height="52" align="center" valign="middle" style="width:52px; height:52px; border-radius:12px; background-color:${BRAND_GREEN_SOFT}; border:1px solid ${BRAND_GREEN_LINE};">
                      <img src="data:image/png;base64,${LOGO_BASE64}" width="36" height="36" alt="HarvestLink" style="display:block; width:36px; height:36px; border:0;" />
                    </td>
                  </tr>
                </table>
                <div style="height:14px; line-height:14px; font-size:1px;">&nbsp;</div>
                <span style="font-family:${FONT_STACK}; font-size:22px; font-weight:700; color:${TEXT_DARK};">HarvestLink</span>
                <div style="height:4px; line-height:4px; font-size:1px;">&nbsp;</div>
                <span style="font-family:${FONT_STACK}; font-size:13px; font-weight:500; color:${TEXT_MUTED};">Email Verification</span>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 8px;">
                <h1 style="margin:0 0 12px; font-family:${FONT_STACK}; font-size:20px; font-weight:700; color:${TEXT_DARK};">Your 6-digit verification code</h1>
                <p style="margin:0; font-family:${FONT_STACK}; font-size:14px; line-height:1.6; color:${TEXT_BODY};">
                  Enter this code to complete your HarvestLink registration.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND_GREEN_SOFT}; border:1px solid ${BRAND_GREEN_LINE}; border-radius:10px;">
                  <tr>
                    <td align="center" style="padding:22px 16px;">
                      <span style="font-family:'Courier New', Courier, monospace; font-size:32px; font-weight:700; letter-spacing:4px; color:${BRAND_GREEN};">${displayCode}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <p style="margin:0; font-family:${FONT_STACK}; font-size:13px; line-height:1.6; color:${TEXT_MUTED};">
                  The code expires in 10 minutes. For your security, do not share this code with anyone.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px; background-color:#f9fafb; border-top:1px solid ${LINE}; border-radius:0 0 12px 12px;">
                <p style="margin:0 0 4px; font-family:${FONT_STACK}; font-size:12px; line-height:1.6; color:${TEXT_FAINT};">
                  If you did not create a HarvestLink account, you can ignore this email.
                </p>
                <p style="margin:0; font-family:${FONT_STACK}; font-size:12px; font-weight:600; color:${TEXT_MUTED};">HarvestLink Team</p>
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
    'Email Verification',
    '',
    'Your 6-digit verification code',
    '',
    spacedDigits(code),
    '',
    'The code expires in 10 minutes. For your security, do not share this code with anyone.',
    '',
    'If you did not create a HarvestLink account, you can ignore this email.',
    '',
    'HarvestLink Team',
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
  });

  if (error) {
    const reason = error?.message || 'Unable to send verification email.';
    if (!isProduction) console.info(`[dev-email-trace] Resend REJECTED the request for ${email}: ${reason}`);
    throw new Error(`Resend API error: ${reason}`, { cause: error });
  }

  if (!isProduction) console.info(`[dev-email-trace] Resend ACCEPTED the request for ${email} — id: ${data?.id}`);
  return data;
}
