// F-16: E-mail-safe HTML layout (no external CSS, no web fonts, table-based).

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Wraps body HTML in the platform e-mail layout.
 * - Header: manga-zine wordmark (Encre & Plume), ink/paper/accent palette
 * - Footer: mentions-légales placeholder (ponytail: F-13 fills the real URL/copy)
 *           + unsubscribe line only when !mandatory && unsubscribeUrl (ponytail: F-15 wires the token)
 */
export function wrapHtml(opts: {
  title: string;
  bodyHtml: string;
  mandatory: boolean;
  unsubscribeUrl?: string;
}): string {
  const { title, bodyHtml, mandatory, unsubscribeUrl } = opts;

  // ponytail: F-15 provides the unsubscribe token and wires the url
  const unsubLine =
    !mandatory && unsubscribeUrl
      ? `<tr><td style="background-color:#16130f;padding:8px 24px;font-size:11px;border-top:1px solid #333;">
          <a href="${esc(unsubscribeUrl)}" style="color:#aaa;text-decoration:underline;">Se désabonner</a>
        </td></tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1ece1;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f1ece1;">
<tr><td align="center" style="padding:24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" role="presentation"
  style="max-width:600px;width:100%;border:3px solid #16130f;box-shadow:5px 5px 0 #16130f;">
  <tr>
    <td style="background-color:#16130f;padding:16px 24px;">
      <span style="font-family:Impact,'Anton',Arial Black,sans-serif;font-size:22px;font-weight:900;color:#e8261c;letter-spacing:0.05em;text-transform:uppercase;">Encre &amp; Plume</span>
    </td>
  </tr>
  <tr>
    <td style="background-color:#f1ece1;padding:32px 24px;color:#16130f;font-size:15px;line-height:1.6;">
      ${bodyHtml}
    </td>
  </tr>
  <tr>
    <td style="background-color:#16130f;padding:12px 24px;font-size:12px;color:#f1ece1;">
      <!-- ponytail: F-13 fills the real mentions-légales URL and copy -->
      <a href="[MENTIONS_LEGALES_URL]" style="color:#f1ece1;text-decoration:underline;">Mentions légales</a>
      &nbsp;&middot;&nbsp;Encre &amp; Plume
    </td>
  </tr>
  ${unsubLine}
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Adds a plain-text footer (mentions légales placeholder).
 * ponytail: F-13 fills the real URL.
 */
export function wrapText(body: string): string {
  return `${body}\n\n--\nMentions légales : [MENTIONS_LEGALES_URL]\n© Encre & Plume`;
}
