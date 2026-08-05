import { appConfig } from "@/lib/config";

/**
 * Shared HTML/text layout for every transactional email this app sends
 * (verification today; password recovery and other notifications will reuse
 * this same renderer). Keeps a single place that owns branding, button
 * styling, and the plain-text fallback, so individual email builders only
 * ever supply content, never markup.
 */
export interface EmailTemplateOptions {
  /** Short, professional opening line, e.g. "Hola," */
  greeting: string;
  /** Body copy, one paragraph per entry. Plain text — HTML-escaped internally. */
  paragraphs: string[];
  /** Label of the single primary call-to-action button. */
  ctaLabel: string;
  /** Destination URL for the button (also shown as a plain-text fallback link). */
  ctaUrl: string;
  /** Expiration / validity note shown below the button, e.g. "Este enlace vence en 24 horas." */
  expirationNote: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEmailTemplate(options: EmailTemplateOptions): { html: string; text: string } {
  const { greeting, paragraphs, ctaLabel, ctaUrl, expirationNote } = options;
  const projectName = appConfig.name;
  const year = new Date().getFullYear();
  const safeCtaUrl = escapeHtml(ctaUrl);

  const paragraphsHtml = paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#1f2937;">${escapeHtml(paragraph)}</p>`)
    .join("\n            ");

  const html = `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(projectName)}</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:32px 32px 0;">
                <p style="margin:0 0 24px;font-size:18px;font-weight:bold;color:#111827;">${escapeHtml(projectName)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#1f2937;">${escapeHtml(greeting)}</p>
                ${paragraphsHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:6px;background-color:#4f46e5;">
                      <a href="${safeCtaUrl}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(ctaLabel)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;">
                <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#6b7280;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
                <p style="margin:0 0 16px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${safeCtaUrl}" style="color:#4f46e5;">${safeCtaUrl}</a></p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;">${escapeHtml(expirationNote)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:11px;line-height:1.5;color:#9ca3af;">© ${year} ${escapeHtml(projectName)}. Este es un mensaje automático, no respondas a este correo.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = [
    projectName,
    "",
    greeting,
    "",
    ...paragraphs,
    "",
    `${ctaLabel}: ${ctaUrl}`,
    "",
    expirationNote,
    "",
    `© ${year} ${projectName}. Este es un mensaje automático, no respondas a este correo.`,
  ].join("\n");

  return { html, text };
}
