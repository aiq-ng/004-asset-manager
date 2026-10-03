/**
 * Email templates.
 *
 * Pure string builders — no imports at all — so they are trivially testable and
 * can never drag server-only modules into a client bundle. Emails are written as
 * tables with inline styles because that is what survives Gmail and Outlook;
 * the colours are the app's light-theme token values (packages/tokens), fixed
 * rather than variable because mail clients do not run our CSS.
 */

/** The app's light-theme palette, mirrored from packages/tokens/build. */
const COLORS = {
  surface: "#F8F9FA",
  card: "#FFFFFF",
  muted: "#F1F3F6",
  textPrimary: "#0B1020",
  textSecondary: "#5B6472",
  textMuted: "#6E7686",
  border: "#E4E7EF",
  primary: "#2F5FE0",
  primaryHover: "#0E2FA8",
  onPrimary: "#FFFFFF",
  healthy: "#0B6B3A",
} as const;

export const APP_NAME = "Inventory Control";

/**
 * Escapes a value interpolated into HTML. Every dynamic string goes through
 * this, so a staff member named `<script>` cannot inject markup into mail.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

interface LayoutInput {
  /** Shown as the preheader / preview text in the mailbox list. */
  preview: string;
  heading: string;
  /** Intro paragraph(s), already escaped by the caller. */
  body: string;
  /** Main content: a button, or a credentials box. */
  content: string;
  appUrl: string;
}

/**
 * The shared frame: centred 600px card on the app's surface colour, hairline
 * accent across the top edge — the same trick the login card uses — and a
 * footer that names the product so the mail is identifiable at a glance.
 */
function layout({ preview, heading, body, content, appUrl }: LayoutInput): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(APP_NAME)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${COLORS.surface};">
    <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.surface};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:100%;">
            <tr>
              <td style="padding-bottom:20px;" align="left">
                <img src="${appUrl}/images/logo.png" alt="${escapeHtml(APP_NAME)}" width="44" height="auto" style="display:block; height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="background-color:${COLORS.card}; border-radius:12px; border:1px solid ${COLORS.border}; overflow:hidden;">
                <div style="height:3px; background-color:${COLORS.primary}; font-size:0; line-height:0;">&nbsp;</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:32px 36px 8px 36px; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:22px; line-height:28px; font-weight:600; color:${COLORS.textPrimary};">
                      ${heading}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 36px 0 36px; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; line-height:24px; color:${COLORS.textSecondary};">
                      ${body}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:24px 36px 8px 36px;">
                      ${content}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 8px 0 8px; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; line-height:18px; color:${COLORS.textMuted}; text-align:center;">
                ${escapeHtml(APP_NAME)} &middot; Asset register
                <br />
                If you were not expecting this email, you can ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Primary call-to-action button. Bulletproof-button markup that keeps its shape in Outlook. */
function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="border-radius:8px; background-color:${COLORS.primary};">
      <a href="${url}" style="display:inline-block; padding:12px 24px; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; line-height:20px; font-weight:600; color:${COLORS.onPrimary}; text-decoration:none; border-radius:8px; background-color:${COLORS.primary};">
        ${escapeHtml(label)}
      </a>
    </td>
  </tr>
</table>
<p style="margin:16px 0 0 0; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:20px; color:${COLORS.textMuted};">
  Or paste this link into your browser:<br />
  <a href="${url}" style="color:${COLORS.primary}; word-break:break-all;">${url}</a>
</p>`;
}

export interface InviteEmailInput {
  name: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
  appUrl: string;
}

export function inviteEmailHtml(input: InviteEmailInput): string {
  const { name, email, temporaryPassword, loginUrl, appUrl } = input;

  return layout({
    preview: `Your ${APP_NAME} account is ready — sign in with the details below.`,
    heading: `Welcome, ${escapeHtml(name)}`,
    body: `<p style="margin:0 0 12px 0;">An account has been created for you on ${escapeHtml(APP_NAME)}, the asset register. Use the credentials below to sign in — you will be asked to keep them safe.</p>`,
    content: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.muted}; border-radius:8px; border:1px solid ${COLORS.border};">
        <tr>
          <td style="padding:16px 20px; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:14px; line-height:22px; color:${COLORS.textSecondary};">
            <strong style="color:${COLORS.textPrimary};">Email</strong><br />
            <span style="color:${COLORS.textPrimary};">${escapeHtml(email)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:0 20px 16px 20px; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:14px; line-height:22px; color:${COLORS.textSecondary};">
            <strong style="color:${COLORS.textPrimary};">Temporary password</strong><br />
            <span style="font-family:'SF Mono',Consolas,Menlo,monospace; font-size:16px; letter-spacing:0.5px; color:${COLORS.primary};">${escapeHtml(temporaryPassword)}</span>
          </td>
        </tr>
      </table>
      <div style="padding-top:20px;">${button(loginUrl, "Sign in")}</div>
      <p style="margin:16px 0 0 0; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:20px; color:${COLORS.textMuted};">
        After signing in you can set your own password under your account settings. If you did not expect this account, tell the person who sent you this email.
      </p>`,
    appUrl,
  });
}

export function inviteEmailText(input: InviteEmailInput): string {
  return [
    `Welcome to ${APP_NAME}, ${input.name}!`,
    "",
    `An account has been created for you. Sign in with:`,
    "",
    `  Email: ${input.email}`,
    `  Temporary password: ${input.temporaryPassword}`,
    "",
    `Sign in here: ${input.loginUrl}`,
    "",
    `After signing in you can set your own password under your account settings.`,
    `If you were not expecting this email, you can ignore it.`,
  ].join("\n");
}

export interface ResetEmailInput {
  name: string;
  resetUrl: string;
  /** How long the link stays valid, in minutes — shown so urgency is explicit. */
  expiresInMinutes: number;
  appUrl: string;
}

export function resetEmailHtml(input: ResetEmailInput): string {
  const { name, resetUrl, expiresInMinutes, appUrl } = input;

  return layout({
    preview: `A link to reset your ${APP_NAME} password — it expires in ${expiresInMinutes} minutes.`,
    heading: name ? `Password reset` : `Password reset`,
    body: `<p style="margin:0 0 12px 0;">${name ? `${escapeHtml(name)}, s` : "S"}omeone asked to reset the password for your ${escapeHtml(APP_NAME)} account. Click below to choose a new one — the link works once and expires in ${expiresInMinutes} minutes.</p>`,
    content: `${button(resetUrl, "Choose a new password")}`,
    appUrl,
  });
}

export function resetEmailText(input: ResetEmailInput): string {
  return [
    `Password reset requested for your ${APP_NAME} account.`,
    "",
    `Open the link below to choose a new password. It works once and expires in ${input.expiresInMinutes} minutes:`,
    "",
    `  ${input.resetUrl}`,
    "",
    `If you did not ask for this, you can ignore the email — your password stays as it was.`,
  ].join("\n");
}
