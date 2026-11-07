import { describe, expect, it } from "vitest";
import {
  adminInvitationTemplate,
  adminPasswordResetTemplate,
  emailVerificationTemplate,
  passwordResetTemplate,
} from "@/lib/mail/template";

describe("email templates", () => {
  describe("emailVerificationTemplate", () => {
    const { html, text } = emailVerificationTemplate("482913");

    it("returns both HTML and plain-text versions", () => {
      expect(html).toContain("<!DOCTYPE html>");
      expect(text).toContain("482913");
    });

    it("shows the OTP in both versions", () => {
      expect(html).toContain("482913");
      expect(text).toContain("482913");
    });

    it("uses the Routiq brand palette", () => {
      expect(html).toContain("#064C50");
      expect(html).toContain("#FFEFD0");
      expect(html).toContain("#BCEB70");
    });

    it("mentions the 10 minute expiry and ignores accidental sign-ups", () => {
      expect(html).toContain("10 minutes");
      expect(text).toContain("10 minutes");
      expect(text).toContain("ignore this email");
    });

    it("escapes HTML in the OTP", () => {
      const result = emailVerificationTemplate("<script>alert(1)</script>");

      expect(result.html).not.toContain("<script>");
      expect(result.html).toContain("&lt;script&gt;");
    });
  });

  describe("passwordResetTemplate", () => {
    const link = "http://auth.localhost:3000/reset-password/abc123";
    const { html, text } = passwordResetTemplate(link);

    it("returns both HTML and plain-text versions", () => {
      expect(html).toContain("<!DOCTYPE html>");
      expect(text).toContain(link);
    });

    it("renders a call to action pointing at the reset link", () => {
      expect(html).toContain(`href="${link}"`);
      expect(html).toContain("Reset my password");
    });

    it("falls back to a copyable link", () => {
      expect(html).toContain("Or copy this link");
      expect(html).toContain(link);
    });

    it("mentions the 10 minute expiry", () => {
      expect(html).toContain("10 minutes");
      expect(text).toContain("10 minutes");
    });

    it("escapes HTML in the reset link", () => {
      const result = passwordResetTemplate('https://routiq.ng/reset"><script>');

      expect(result.html).not.toContain('"><script>');
      expect(result.html).toContain("&quot;&gt;&lt;script&gt;");
    });
  });

  describe("adminInvitationTemplate", () => {
    const link = "http://admin.localhost:3000/reset-password/abc123";
    const { html, text } = adminInvitationTemplate({
      name: "Ada <Admin>",
      role: "OPERATIONS_ADMIN",
      link,
    });

    it("renders the invitee, readable role and activation link", () => {
      expect(html).toContain(`href="${link}"`);
      expect(html).toContain("Operations Admin");
      expect(text).toContain("Operations Admin");
      expect(text).toContain(link);
    });

    it("escapes HTML in the invitee name", () => {
      expect(html).not.toContain("<Admin>");
      expect(html).toContain("&lt;Admin&gt;");
    });

    it("mentions the 10 minute expiry", () => {
      expect(html).toContain("10 minutes");
      expect(text).toContain("10 minutes");
    });
  });

  describe("adminPasswordResetTemplate", () => {
    const link = "http://admin.localhost:3000/reset-password/abc123";
    const { html, text } = adminPasswordResetTemplate(link);

    it("returns admin-specific HTML and text", () => {
      expect(html).toContain(`href="${link}"`);
      expect(html).toContain("Reset my admin password");
      expect(text).toContain("Routiq admin password");
    });

    it("mentions the 10 minute expiry", () => {
      expect(html).toContain("10 minutes");
      expect(text).toContain("10 minutes");
    });
  });
});
