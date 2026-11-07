import {
  SMTP_FROM_EMAIL,
  SMTP_FROM_NAME,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_SERVICE,
  SMTP_USER,
} from "@/config/env";
import { createError } from "@/utils";
import nodemailer, { type Transporter } from "nodemailer";

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

const resolveFromEmail = () => SMTP_FROM_EMAIL || SMTP_USER;

/**
 * True when enough SMTP details are present to attempt delivery. Routes that
 * send mail should fail with a 503 instead of silently pretending to succeed.
 */
export const isMailConfigured = Boolean(
  (SMTP_SERVICE || SMTP_HOST) && resolveFromEmail(),
);

export const getTransportOptions = () => {
  const auth =
    SMTP_USER && SMTP_PASS
      ? { user: SMTP_USER, pass: SMTP_PASS }
      : undefined;

  if (SMTP_SERVICE) {
    return { service: SMTP_SERVICE, auth };
  }

  return {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth,
  };
};

export const getFromAddress = () => {
  const email = resolveFromEmail();
  const name = SMTP_FROM_NAME.replace(/["\\]/g, "");

  return `"${name}" <${email}>`;
};

let transporter: Transporter | null = null;

export const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport(getTransportOptions());
  }

  return transporter;
};

export const sendMail = async ({ to, subject, html, text }: MailMessage) => {
  if (!isMailConfigured) {
    throw createError(
      "Email delivery is not configured yet. Please contact support.",
      503,
    );
  }

  try {
    await getTransporter().sendMail({
      from: getFromAddress(),
      to,
      subject,
      html,
      text,
    });
  } catch (error) {
    console.error("[mail] Failed to send email", { to, subject, error });

    throw createError(
      "We couldn't send that email right now. Please try again shortly.",
      503,
    );
  }
};
