export type EmailContent = {
  html: string;
  text: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeAttribute = (value: string) => escapeHtml(value).replace(/`/g, "&#96;");

const BRAND = {
  teal: "#064C50",
  tealDeep: "#0B2E30",
  lime: "#BCEB70",
  cream: "#FFEFD0",
  ink: "#111111",
  muted: "#6B6B6B",
  line: "#E9ECEC",
  well: "#EDF2F2",
};

const FONT_STACK =
  "'Poppins', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

type LayoutOptions = {
  preheader: string;
  eyebrow: string;
  heading: string;
  body: string;
  footerNote?: string;
};

const emailLayout = ({
  preheader,
  eyebrow,
  heading,
  body,
  footerNote = "You are receiving this email because you have a Routiq account.",
}: LayoutOptions) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${BRAND.cream};-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
      ${escapeHtml(preheader)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.cream};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
            <tr>
              <td style="padding:0 4px 16px 4px;">
                <span style="font-family:${FONT_STACK};font-size:22px;font-weight:700;letter-spacing:-0.03em;color:${BRAND.teal};">
                  Routiq<span style="color:${BRAND.tealDeep};">.</span>
                </span>
              </td>
            </tr>
            <tr>
              <td style="background-color:${BRAND.teal};border-radius:24px 24px 0 0;padding:36px 40px 40px 40px;">
                <p style="margin:0 0 14px 0;font-family:${FONT_STACK};font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.lime};">
                  ${escapeHtml(eyebrow)}
                </p>
                <h1 style="margin:0;font-family:${FONT_STACK};font-size:28px;line-height:1.15;font-weight:600;letter-spacing:-0.03em;color:#FFFFFF;">
                  ${escapeHtml(heading)}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="background-color:#FFFFFF;border-left:1px solid ${BRAND.line};border-right:1px solid ${BRAND.line};padding:36px 40px;">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="background-color:#FFFFFF;border:1px solid ${BRAND.line};border-top:0;border-radius:0 0 24px 24px;padding:0 40px 34px 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="border-top:1px solid ${BRAND.line};padding-top:22px;">
                      <p style="margin:0 0 6px 0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${BRAND.muted};">
                        ${escapeHtml(footerNote)}
                      </p>
                      <p style="margin:0;font-family:${FONT_STACK};font-size:11px;line-height:1.6;color:#9A9A9A;">
                        Routiq &middot; Nigeria&rsquo;s marketplace for everyday essentials
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const paragraph = (content: string) =>
  `<p style="margin:0 0 18px 0;font-family:${FONT_STACK};font-size:14px;line-height:1.7;color:${BRAND.ink};">${content}</p>`;

const button = (href: string, label: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
    <tr>
      <td align="center" style="background-color:${BRAND.teal};border-radius:999px;">
        <a href="${escapeAttribute(href)}" style="display:inline-block;padding:14px 30px;font-family:${FONT_STACK};font-size:14px;font-weight:600;letter-spacing:-0.01em;color:#FFFFFF;text-decoration:none;border-radius:999px;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`;

const fallbackLink = (href: string) => `
  <p style="margin:0 0 6px 0;font-family:${FONT_STACK};font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.muted};">
    Or copy this link
  </p>
  <p style="margin:0 0 22px 0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${BRAND.teal};word-break:break-all;">
    ${escapeHtml(href)}
  </p>`;

const noteBox = (content: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px 0;">
    <tr>
      <td style="background-color:${BRAND.cream};border-radius:16px;padding:16px 18px;">
        <p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:1.65;color:${BRAND.tealDeep};">
          ${content}
        </p>
      </td>
    </tr>
  </table>`;

export const emailVerificationTemplate = (otp: string): EmailContent => {
  const safeOtp = escapeHtml(otp);

  const body = `
    ${paragraph("Welcome to Routiq. Confirm your email address to finish setting up your account and start shopping or selling with confidence.")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
      <tr>
        <td align="center" style="background-color:${BRAND.well};border:1px solid ${BRAND.line};border-radius:16px;padding:26px 20px;">
          <p style="margin:0 0 8px 0;font-family:${FONT_STACK};font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.muted};">
            Your verification code
          </p>
          <p style="margin:0;font-family:${FONT_STACK};font-size:32px;line-height:1.1;font-weight:700;letter-spacing:0.28em;color:${BRAND.teal};">
            ${safeOtp}
          </p>
        </td>
      </tr>
    </table>
    ${paragraph("Enter this code on the verification screen. It expires in 10 minutes and can only be used once.")}
    ${noteBox("If you did not create a Routiq account, you can safely ignore this email.")}
  `;

  return {
    html: emailLayout({
      preheader: `Your Routiq verification code is ${otp}. It expires in 10 minutes.`,
      eyebrow: "Verify your email",
      heading: "Let\u2019s confirm it\u2019s you",
      body,
    }),
    text: [
      "Verify your Routiq email",
      "",
      `Your verification code is: ${otp}`,
      "",
      "Enter this code on the verification screen. It expires in 10 minutes and can only be used once.",
      "",
      "If you did not create a Routiq account, you can safely ignore this email.",
      "",
      "Routiq - Nigeria's marketplace for everyday essentials",
    ].join("\n"),
  };
};

export const passwordResetTemplate = (link: string): EmailContent => {
  const body = `
    ${paragraph("We received a request to reset the password for your Routiq account. Choose a new password to get back to shopping or managing your store.")}
    ${button(link, "Reset my password")}
    ${fallbackLink(link)}
    ${paragraph("This link expires in 10 minutes and can only be used once.")}
    ${noteBox("Didn\u2019t request a password reset? You can ignore this email \u2014 your password will stay the same.")}
  `;

  return {
    html: emailLayout({
      preheader: "Reset your Routiq password. This link expires in 10 minutes.",
      eyebrow: "Password reset",
      heading: "Let\u2019s get you back in",
      body,
    }),
    text: [
      "Reset your Routiq password",
      "",
      "We received a request to reset the password for your Routiq account.",
      "Choose a new password using the link below:",
      "",
      link,
      "",
      "This link expires in 10 minutes and can only be used once.",
      "",
      "Didn't request a password reset? You can ignore this email - your password will stay the same.",
      "",
      "Routiq - Nigeria's marketplace for everyday essentials",
    ].join("\n"),
  };
};

const roleLabel = (role: string) =>
  role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const adminInvitationTemplate = ({
  name,
  role,
  link,
}: {
  name: string;
  role: string;
  link: string;
}): EmailContent => {
  const safeName = escapeHtml(name);
  const safeRole = escapeHtml(roleLabel(role));

  const body = `
    ${paragraph(`Hi ${safeName}, you have been invited to the Routiq admin console as a <strong>${safeRole}</strong>.`)}
    ${paragraph("Set a password to activate your account. Admin accounts are separate from customer and vendor accounts, and access is limited to the permissions assigned to your role.")}
    ${button(link, "Activate my admin account")}
    ${fallbackLink(link)}
    ${paragraph("This invitation expires in 10 minutes and can only be used once.")}
    ${noteBox("If you were not expecting this invitation, you can ignore this email. Your account will stay inactive.")}
  `;

  return {
    html: emailLayout({
      preheader: "You have been invited to the Routiq admin console.",
      eyebrow: "Admin invitation",
      heading: "Your admin console access",
      body,
      footerNote:
        "You are receiving this email because a Routiq Super Admin invited you.",
    }),
    text: [
      `Hi ${name},`,
      "",
      `You have been invited to the Routiq admin console as a ${roleLabel(role)}.`,
      "",
      "Set a password to activate your account using the link below:",
      "",
      link,
      "",
      "This invitation expires in 10 minutes and can only be used once.",
      "",
      "If you were not expecting this invitation, you can ignore this email.",
      "",
      "Routiq - Nigeria's marketplace for everyday essentials",
    ].join("\n"),
  };
};

export const adminPasswordResetTemplate = (link: string): EmailContent => {
  const body = `
    ${paragraph("We received a request to reset the password for your Routiq admin account. Choose a new password to regain access to the admin console.")}
    ${button(link, "Reset my admin password")}
    ${fallbackLink(link)}
    ${paragraph("This link expires in 10 minutes and can only be used once.")}
    ${noteBox("Didn\u2019t request a reset? You can ignore this email \u2014 your password will stay the same.")}
  `;

  return {
    html: emailLayout({
      preheader:
        "Reset your Routiq admin password. This link expires in 10 minutes.",
      eyebrow: "Admin password reset",
      heading: "Let\u2019s secure your account",
      body,
      footerNote:
        "You are receiving this email because a password reset was requested for a Routiq admin account.",
    }),
    text: [
      "Reset your Routiq admin password",
      "",
      "We received a request to reset the password for your Routiq admin account.",
      "Choose a new password using the link below:",
      "",
      link,
      "",
      "This link expires in 10 minutes and can only be used once.",
      "",
      "Didn't request a reset? You can ignore this email - your password will stay the same.",
      "",
      "Routiq - Nigeria's marketplace for everyday essentials",
    ].join("\n"),
  };
};
