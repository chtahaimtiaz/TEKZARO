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

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
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

/**
 * Sends an email via SMTP if configured. Every call is logged to EmailLog
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

  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    await prisma.emailLog.create({
      data: {
        to: input.to,
        subject: input.subject,
        status: "SENT",
        relatedType: input.relatedType,
        relatedId: input.relatedId,
      },
    });
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown email send error.";
    await prisma.emailLog.create({
      data: {
        to: input.to,
        subject: input.subject,
        status: "FAILED",
        error: message,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
      },
    });
    return { ok: false, error: message };
  }
}
