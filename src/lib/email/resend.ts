import "server-only";

import { Resend } from "resend";

import { getEnv } from "@/lib/env";
import { PASSWORD_RESET_TTL_MINUTES } from "@/lib/config";
import {
  APP_NAME,
  inviteEmailHtml,
  inviteEmailText,
  resetEmailHtml,
  resetEmailText,
} from "@/lib/email/templates";

/**
 * Transactional email over the Resend HTTP API.
 *
 * Sending is awaited rather than queued: the invite password is shown once, in
 * that email, so the sender has to know whether it went out before the request
 * succeeds. Resend's SDK resolves to `{ data, error }` rather than throwing, so
 * the error branch is part of the normal flow here.
 *
 * With no `RESEND_API_KEY` configured the transport deliberately does not fail:
 * it logs what it would have sent and reports `skipped`. That keeps the app
 * bootable (and the invite/reset flows testable) on a laptop with no Resend
 * account, while production — where the key is always set — sends for real.
 */

export interface SendEmailResult {
  /** Resend accepted the message. */
  delivered: boolean;
  /** True when no API key is configured and nothing was sent. */
  skipped: boolean;
  /** Resend message id, when delivered. */
  id?: string;
  /** Why delivery failed, when it failed. */
  error?: string;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendEmailResult> {
  const { RESEND_API_KEY, EMAIL_FROM } = getEnv();

  if (!RESEND_API_KEY) {
    // Dev affordance: the credentials are printed so the invite/reset flow can
    // be walked through end to end without a Resend account. Server logs are a
    // privileged place; with a key configured the password is never logged.
    console.log(
      `[email] RESEND_API_KEY not set — not sending.\n` +
        `  to:      ${input.to}\n` +
        `  subject: ${input.subject}\n` +
        `  text:    ${input.text.replace(/\n+/g, " | ")}`,
    );
    return { delivered: false, skipped: true };
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    if (error) {
      console.error("[email] Resend rejected the message:", error);
      return { delivered: false, skipped: false, error: error.message };
    }

    return { delivered: true, skipped: false, id: data?.id };
  } catch (error) {
    console.error("[email] failed to reach Resend:", error);
    return {
      delivered: false,
      skipped: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

export interface InviteEmailInput {
  to: string;
  name: string;
  temporaryPassword: string;
}

/** The invite: username + temporary password, with a sign-in button. */
export async function sendInviteEmail(input: InviteEmailInput): Promise<SendEmailResult> {
  const appUrl = getEnv().APP_URL;

  return sendEmail({
    to: input.to,
    subject: `Your ${APP_NAME} account is ready`,
    html: inviteEmailHtml({
      name: input.name,
      email: input.to,
      temporaryPassword: input.temporaryPassword,
      loginUrl: `${appUrl}/login`,
      appUrl,
    }),
    text: inviteEmailText({
      name: input.name,
      email: input.to,
      temporaryPassword: input.temporaryPassword,
      loginUrl: `${appUrl}/login`,
      appUrl,
    }),
  });
}

export interface ResetEmailInput {
  to: string;
  name: string;
  /** The raw, single-use token — embedded in the link, never logged. */
  rawToken: string;
}

/** Password reset: a single-use link that expires (see PASSWORD_RESET_TTL_MINUTES). */
export async function sendPasswordResetEmail(input: ResetEmailInput): Promise<SendEmailResult> {
  const { APP_URL } = getEnv();
  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(input.rawToken)}`;

  return sendEmail({
    to: input.to,
    subject: `Reset your ${APP_NAME} password`,
    html: resetEmailHtml({
      name: input.name,
      resetUrl,
      expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
      appUrl: APP_URL,
    }),
    text: resetEmailText({
      name: input.name,
      resetUrl,
      expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
      appUrl: APP_URL,
    }),
  });
}
