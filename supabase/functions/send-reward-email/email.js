const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const firstName = (displayName) =>
  String(displayName ?? "").trim().split(/\s+/u)[0] || "cliente";

export const renderRewardEmail = ({
  displayName,
  rewardDescription,
  appUrl = "https://www.spiritcoffee.es/",
  logoUrl = "https://www.spiritcoffee.es/email/logo-white.png",
  patternUrl = "https://www.spiritcoffee.es/email/paw-pattern.png",
}) => {
  const safeName = escapeHtml(firstName(displayName));
  const safeReward = escapeHtml(rewardDescription || "Café gratuito");
  const safeAppUrl = escapeHtml(appUrl);
  const safeLogoUrl = escapeHtml(logoUrl);
  const safePatternUrl = escapeHtml(patternUrl);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Has conseguido una recompensa Spirit</title>
</head>
<body style="margin:0;padding:0;background:#eecf62;color:#292824;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eecf62 url('${safePatternUrl}') center top/768px auto repeat;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
          <tr>
            <td align="center" style="padding:8px 0 24px;">
              <img src="${safeLogoUrl}" width="180" alt="Spirit Coffee" style="display:block;width:180px;max-width:100%;height:auto;border:0;">
              <div style="margin-top:12px;color:#292824;font-size:13px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Spirit Coffee Club</div>
            </td>
          </tr>
          <tr>
            <td style="border-radius:32px;background:#292824;padding:42px 36px;box-shadow:0 18px 50px rgba(41,40,36,.18);">
              <div style="color:#eecf62;font-size:13px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Tu fidelidad tiene premio</div>
              <h1 style="margin:18px 0 14px;color:#fffaf0;font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:1.05;font-weight:700;">¡Enhorabuena, ${safeName}!</h1>
              <p style="margin:0 0 24px;color:#e8dfca;font-size:18px;line-height:1.6;">Has completado tu tarjeta Spirit y ya tienes una nueva recompensa disponible.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 28px;border:1px solid rgba(238,207,98,.45);border-radius:22px;background:#34322d;">
                <tr>
                  <td style="padding:22px 24px;">
                    <div style="color:#bdb39d;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Tu recompensa</div>
                    <div style="margin-top:8px;color:#fffaf0;font-size:25px;font-weight:800;line-height:1.25;">${safeReward}</div>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td bgcolor="#eecf62" style="border-radius:999px;">
                    <a href="${safeAppUrl}" style="display:inline-block;padding:16px 28px;color:#292824;text-decoration:none;font-size:16px;font-weight:800;">Ver mi recompensa</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#bdb39d;font-size:13px;line-height:1.55;">Abre Spirit Coffee para consultar y canjear tu premio cuando quieras. Este mensaje no incluye códigos ni datos de acceso.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 16px 8px;color:#5e552f;font-size:12px;line-height:1.6;">
              Cafetería Spirit · Montcada i Reixac<br>
              Email transaccional asociado a tu tarjeta de fidelización.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const sendWithResend = async ({
  fetchImpl = fetch,
  apiKey,
  from,
  to,
  subject,
  html,
  idempotencyKey,
}) => {
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.message === "string"
      ? payload.message
      : `Resend returned HTTP ${response.status}`;
    throw new Error(message);
  }

  if (typeof payload?.id !== "string" || !payload.id) {
    throw new Error("Resend did not return a message id");
  }

  return payload.id;
};
