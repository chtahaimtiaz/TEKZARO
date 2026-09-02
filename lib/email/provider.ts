import "server-only";
import nodemailer from "nodemailer";
import { prisma } from "../prisma";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  relatedType?: string;
  relatedId?: string;
}

export type SendEmailResult = { ok: true } | { ok: false; notConfigured: true } | { ok: false; error: string };

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function isBrevoApiConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY);
}

export function isEmailConfigured(): boolean {
  return isBrevoApiConfigured() || isSmtpConfigured();
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cachedTransporter;
}

function fromAddress(): string {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "";
}

type SendAttempt = { ok: true } | { ok: false; error: string };

/**
 * Sends via Brevo's transactional email HTTP API — preferred over SMTP
 * relay whenever BREVO_API_KEY is set. Brevo's SMTP relay login is
 * IP-gated (new/unrecognized IPs get "535 Unauthorized IP address"), which
 * is fundamentally incompatible with Vercel's serverless functions running
 * from many different, rotating outbound IPs — confirmed live: SMTP relay
 * worked for exactly one lucky authorized IP, then failed for every
 * request after from a different one. The API authenticates purely by key
 * over HTTPS, with no such restriction.
 */
async function sendViaBrevoApi(input: SendEmailInput): Promise<SendAttempt> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: fromAddress() },
      to: [{ email: input.to }],
      subject: input.subject,
      htmlContent: input.html,
      textContent: input.text,
    }),
  });

  if (res.ok) return { ok: true };
  const body = await res.text().catch(() => "");
  return { ok: false, error: `Brevo API ${res.status}: ${body.slice(0, 500)}` };
}

async function sendViaSmtp(input: SendEmailInput): Promise<SendAttempt> {
  try {
    await getTransporter().sendMail({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email send error." };
  }
}

/**
 * Sends an email if configured (Brevo API preferred when BREVO_API_KEY is
 * set; plain SMTP relay otherwise, for non-Brevo hosts without the IP-gate
 * quirk). Every call is logged to EmailLog (SENT/FAILED/NOT_CONFIGURED) —
 * mirrors the AIGeneration honest-logging pattern from Phase 4: callers
 * never have to guess whether a send actually happened, and a failure is
 * visible in /admin/monitoring rather than swallowed. Never throws —
 * callers (invite, reset, notifications, newsletter) degrade gracefully on
 * {ok:false}.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!isEmailConfigured()) {
    await prisma.emailLog.create({
      data: {
        to: input.to,
        subject: input.subject,
        status: "NOT_CONFIGURED",
        relatedType: input.relatedType,
        relatedId: input.relatedId,
      },
    });
    return { ok: false, notConfigured: true };
  }

  const attempt = isBrevoApiConfigured() ? await sendViaBrevoApi(input) : await sendViaSmtp(input);

  await prisma.emailLog.create({
    data: {
      to: input.to,
      subject: input.subject,
      status: attempt.ok ? "SENT" : "FAILED",
      error: attempt.ok ? undefined : attempt.error,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
    },
  });

  return attempt.ok ? { ok: true } : { ok: false, error: attempt.error };
}
