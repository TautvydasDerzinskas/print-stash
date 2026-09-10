import nodemailer from "nodemailer";
import { PUBLIC_URL } from "../config";
import { getSmtpSettings } from "./settingsService";

/** Sends the account-verification email a new registration (see routes/auth.ts) waits on before
 * it can sign in. Only ever called once the caller has already confirmed SMTP is configured
 * (isSmtpConfigured) -- throws if `host` somehow ends up unset here anyway, since silently
 * dropping a verification email would leave the account permanently unreachable. */
export async function sendVerificationEmail(to: string, displayName: string, token: string): Promise<void> {
  const smtp = await getSmtpSettings();
  if (!smtp.host) throw new Error("SMTP is not configured");

  const link = `${PUBLIC_URL}/verify-email?token=${encodeURIComponent(token)}`;

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? undefined } : undefined,
  });

  await transporter.sendMail({
    from: smtp.from,
    to,
    subject: "Confirm your Thingport account",
    text: `Hi ${displayName},\n\nConfirm your email address to finish creating your Thingport account:\n${link}\n\nThis link expires in 24 hours.`,
    html: `<p>Hi ${displayName},</p><p>Confirm your email address to finish creating your Thingport account:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
  });
}
