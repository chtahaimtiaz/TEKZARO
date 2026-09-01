import { SITE_NAME, siteUrl } from "../constants";

/**
 * Wraps a plain HTML fragment (the existing per-message content — invite,
 * reset, notification, newsletter, etc.) in a minimal branded shell: logo +
 * wordmark header, white content card, footer. Table-based layout for real
 * email-client compatibility (no flexbox/grid — many clients strip both).
 * Deliberately light-theme-only: email dark-mode support needs its own
 * prefers-color-scheme handling per client and isn't attempted here, only
 * the logo/brand-color pass this call asked for. Callers keep their own
 * plain-text sibling untouched — this only wraps the html field.
 *
 * Deliberately NOT server-only: it only reads siteUrl() (backed by the
 * NEXT_PUBLIC_ env var, already inlined into the client bundle by design)
 * and plain constants — nothing sensitive — so components/admin/
 * NewCampaignForm.tsx can call it directly client-side for an instant,
 * network-free live preview while composing, before the campaign is saved.
 */
export function wrapEmailHtml(bodyHtml: string): string {
  const logoUrl = `${siteUrl()}/logo.png`;
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f1ede4;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1ede4;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:#0b0f14;padding:24px;text-align:center;">
                <img src="${logoUrl}" width="40" height="40" alt="${SITE_NAME}" style="border-radius:8px;display:inline-block;vertical-align:middle;border:0;" />
                <span style="color:#ffffff;font-size:20px;font-weight:900;vertical-align:middle;margin-left:8px;font-family:Georgia,serif;">${SITE_NAME}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;color:#0b0f14;font-size:14px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #e4ded3;color:#6b7280;font-size:11px;text-align:center;">
                © ${new Date().getFullYear()} ${SITE_NAME}. Pakistan-first technology journalism.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
