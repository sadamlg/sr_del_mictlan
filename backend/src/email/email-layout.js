export const EMAIL_COLORS = {
  background: '#0f0e0a',
  ivory: '#f1e7d6',
  bone: '#e2e3e0',
  sageMuted: '#bfc9c3',
  earthMuted: '#99907c',
  teal: '#97d2c6',
  tealDeep: '#0f5047',
};

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

export function emailBrandImageUrl(appBaseUrl) {
  if (typeof appBaseUrl !== 'string' || !appBaseUrl) return null;
  try {
    return new URL('/images/brand/senor-del-mictlan-brand.png', appBaseUrl).toString();
  } catch {
    return null;
  }
}

export function renderBrandedEmail(contentHtml, { brandImageUrl } = {}) {
  const brandHeader = brandImageUrl
    ? `<img src="${escapeHtml(brandImageUrl)}" alt="Señor del Mictlán" width="180" height="89" style="display:block;width:180px;height:89px;border:0;outline:none;text-decoration:none">`
    : `<p style="margin:0;color:${EMAIL_COLORS.bone};font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:400;letter-spacing:1.5px;line-height:1.5;text-transform:uppercase">Señor del Mictlán</p>`;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
  </head>
  <body bgcolor="${EMAIL_COLORS.background}" style="margin:0;padding:0;background-color:${EMAIL_COLORS.background};color:${EMAIL_COLORS.ivory};font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${EMAIL_COLORS.background}" style="width:100%;background-color:${EMAIL_COLORS.background}">
      <tr>
        <td align="center" bgcolor="${EMAIL_COLORS.background}" style="padding:36px 16px;background-color:${EMAIL_COLORS.background}">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" bgcolor="${EMAIL_COLORS.background}" style="width:100%;max-width:560px;background-color:${EMAIL_COLORS.background};border:1px solid #29423b">
            <tr>
              <td bgcolor="${EMAIL_COLORS.background}" style="padding:0;background-color:${EMAIL_COLORS.background}">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse">
                  <tr>
                    <td bgcolor="${EMAIL_COLORS.background}" style="padding:12px 28px;background-color:${EMAIL_COLORS.background}">${brandHeader}</td>
                  </tr>
                  <tr>
                    <td bgcolor="${EMAIL_COLORS.background}" style="padding:24px 28px 32px;background-color:${EMAIL_COLORS.background}">
                      <div style="width:40px;height:1px;margin:18px 0 24px;background-color:${EMAIL_COLORS.teal}"></div>
                      ${contentHtml}
                      <p style="margin:28px 0 0;border-top:1px solid #352f26;padding-top:18px;color:${EMAIL_COLORS.earthMuted};font-size:11px;letter-spacing:1.2px;line-height:1.6;text-transform:uppercase">Señor del Mictlán · Etúcuaro, Michoacán</p>
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
}
