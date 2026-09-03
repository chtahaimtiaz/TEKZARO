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

function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function isEmailConfigured(): boolean {
  return isResendConfigured() || isSmtpConfigured();
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

/** EMAIL_FROM is the canonical name; SMTP_FROM is still read as a fallback
 * so an SMTP-configured deployment keeps working without renaming a var. */
function fromAddress(): string {
  return process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "";
}

type SendAttempt = { ok: true } | { ok: false; error: string };

/**
 * Sends via Resend's HTTP API — the preferred transport whenever
 * RESEND_API_KEY is set, because it authenticates purely by key over HTTPS
 * with no IP allowlist. That matters specifically on Vercel: serverless
 * functions send from many different, rotating AWS IPs, so any provider
 * that gates SMTP login on a list of known IPs fails intermittently and
 * unpredictably here. Confirmed live against the previous provider — four
 * consecutive sends from production came from three different IPs, and
 * only the single pre-authorized one was accepted.
 *
 * Note that Resend (like every reputable sender) will only deliver to
 * arbitrary recipients once a sending domain is verified; until then it
 * accepts mail only to the account owner's own address. That's a DNS/SPF
 * matter, not a code one — this function's behavior doesn't change.
 */
async function sendViaResend(input: SendEmailInput): Promise<SendAttempt> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY!}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (res.ok) return { ok: true };
  const body = await res.text().catch(() => "");
  return { ok: false, error: `Resend API ${res.status}: ${body.slice(0, 500)}` };
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
 * Sends an email if configured (Resend preferred when RESEND_API_KEY is
 * set; plain SMTP relay otherwise). Every call is logged to EmailLog
 * (SENT/FAILED/NOT_CONFIGURED) — mirrors the AIGeneration honest-logging
 * pattern from Phase 4: callers never have to guess whether a send actually
 * happened, and a failure is visible in /admin/monitoring rather than
 * swallowed. Never throws — callers (invite, reset, notifications,
 * newsletter) degrade gracefully on {ok:false}.
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

  const attempt = isResendConfigured() ? await sendViaResend(input) : await sendViaSmtp(input);

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
