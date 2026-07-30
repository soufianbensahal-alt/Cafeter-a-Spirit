const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const firstName = (displayName) =>
  String(displayName ?? "").trim().split(/\s+/u)[0] || "cliente";

const cleanText = (value, fallback = "") =>
  String(value || fallback)
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const rewardAppUrl = (value) => {
  const fallback = "https://www.spiritcoffee.es/";

  try {
    const url = new URL(value || fallback);
    if (!["http:", "https:"].includes(url.protocol)) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
};

export const renderRewardEmail = ({
  displayName,
  rewardDescription,
  appUrl = "https://www.spiritcoffee.es/",
  logoUrl = "https://www.spiritcoffee.es/email/logo-white.png",
  patternUrl = "https://www.spiritcoffee.es/email/paw-pattern.png",
}) => {
  const safeName = escapeHtml(firstName(displayName));
  const safeReward = escapeHtml(rewardDescription || "Café gratuito");
  const safeAppUrl = escapeHtml(rewardAppUrl(appUrl));
  const safeLogoUrl = escapeHtml(logoUrl);
  const safePatternUrl = escapeHtml(patternUrl);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Has conseguido una recompensa Spirit</title>
</head>
<body style="margin:0;padding:0;background-color:#EECF62;color:#272622;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Has completado tu tarjeta Spirit y ya tienes una nueva recompensa disponible.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#EECF62" background="${safePatternUrl}" style="width:100%;background-color:#EECF62;background-image:url('${safePatternUrl}');background-position:center top;background-repeat:repeat;">
    <tr>
      <td align="center" style="padding:32px 12px 36px;">
        <!--[if mso]>
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td>
        <![endif]-->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
          <tr>
            <td align="center" style="padding:0 0 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#272622" style="width:100%;background-color:#272622;border-radius:24px;">
                <tr>
                  <td align="center" style="padding:28px 24px 24px;text-align:center;">
                    <img src="${safeLogoUrl}" width="190" alt="Spirit Coffee Club" style="display:block;width:190px;max-width:100%;height:auto;margin:0 auto;border:0;color:#FFF9EC;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:bold;text-align:center;">
                    <p style="margin:16px 0 0;color:#F4D35E;font-size:13px;line-height:20px;font-weight:bold;letter-spacing:3px;text-align:center;text-transform:uppercase;">Spirit Coffee Club</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" bgcolor="#272622" style="padding:36px 32px;border-radius:28px;background-color:#272622;text-align:center;">
              <p style="margin:0;color:#F4D35E;font-size:13px;line-height:20px;font-weight:bold;letter-spacing:2.5px;text-align:center;text-transform:uppercase;">Tu fidelidad tiene premio</p>
              <h1 style="margin:18px 0 16px;color:#FFF9EC;font-family:Georgia,'Times New Roman',serif;font-size:40px;line-height:46px;font-weight:bold;text-align:center;">¡Enhorabuena, ${safeName}!</h1>
              <p style="margin:0 auto 28px;max-width:470px;color:#FFF9EC;font-size:18px;line-height:29px;text-align:center;">Has completado tu tarjeta Spirit y ya tienes una nueva recompensa disponible.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#34322D" style="width:100%;margin:0 0 28px;background-color:#34322D;border:2px solid #F4D35E;border-radius:22px;">
                <tr>
                  <td align="center" style="padding:24px;text-align:center;">
                    <p style="margin:0;color:#F4D35E;font-size:12px;line-height:18px;font-weight:bold;letter-spacing:2px;text-align:center;text-transform:uppercase;">Tu recompensa</p>
                    <p style="margin:8px 0 0;color:#FFF9EC;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:36px;font-weight:bold;text-align:center;">${safeReward}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td align="center" height="54" bgcolor="#F4D35E" style="height:54px;background-color:#F4D35E;border-radius:27px;mso-padding-alt:0 30px;">
                    <a href="${safeAppUrl}" style="display:inline-block;min-width:220px;color:#272622;font-size:16px;line-height:54px;font-weight:bold;text-align:center;text-decoration:none;">Ver mi recompensa</a>
                  </td>
                </tr>
              </table>
              <p style="margin:26px auto 0;max-width:470px;color:#DDD4BF;font-size:16px;line-height:25px;text-align:center;">Abre Spirit Coffee para consultar y canjear tu premio cuando quieras.<br>Este mensaje no incluye códigos ni datos de acceso.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 16px 4px;color:#4F482C;font-size:12px;line-height:20px;text-align:center;">
              Cafetería Spirit · Montcada i Reixac<br>
              Email transaccional asociado a tu tarjeta de fidelización.
            </td>
          </tr>
        </table>
        <!--[if mso]>
            </td>
          </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const renderRewardEmailText = ({
  displayName,
  rewardDescription,
  appUrl = "https://www.spiritcoffee.es/",
}) => {
  const name = cleanText(firstName(displayName), "cliente");
  const reward = cleanText(rewardDescription, "Café gratuito");
  const url = rewardAppUrl(appUrl);

  return `SPIRIT COFFEE CLUB

TU FIDELIDAD TIENE PREMIO

¡Enhorabuena, ${name}!

Has completado tu tarjeta Spirit y ya tienes una nueva recompensa disponible.

TU RECOMPENSA
${reward}

Ver mi recompensa:
${url}

Abre Spirit Coffee para consultar y canjear tu premio cuando quieras.
Este mensaje no incluye códigos ni datos de acceso.

Cafetería Spirit · Montcada i Reixac
Email transaccional asociado a tu tarjeta de fidelización.`;
};

export const sendWithResend = async ({
  fetchImpl = fetch,
  apiKey,
  from,
  to,
  subject,
  html,
  text,
  idempotencyKey,
}) => {
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
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
