/**
 * Universal PayPal webhook handler for Vercel or AWS Lambda.
 * - Extracts buyer email and purchased item info.
 * - Fetches email template from GitHub (cached for performance).
 * - Sends email via Resend API (no custom domain needed).
 */

let cachedEmailTemplate = null; // Cache template to reduce GitHub requests

// Fetch the email template from GitHub with caching
async function getEmailTemplate() {
  if (cachedEmailTemplate) return cachedEmailTemplate;

  const GITHUB_EMAIL_URL =
    "https://raw.githubusercontent.com/PratikDilipGade/PratikGade/main/email.txt";

  const response = await fetch(GITHUB_EMAIL_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch email template: ${response.status}`);
  }

  cachedEmailTemplate = await response.text();
  return cachedEmailTemplate;
}

// Send email via Resend API
async function sendEmail({ to, subject, html }) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    throw new Error("Resend API key not configured");
  }

  const RESEND_EMAIL = "Your Store <onboarding@resend.dev>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_EMAIL,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Resend API error response:", text);
    throw new Error(`Resend API error: ${response.status}`);
  }

  return response.json();
}

// Main webhook handler
async function paypalWebhookHandler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
      }
    }

    if (body.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
      return res.status(200).json({ message: "Ignored non-payment event" });
    }

    const resource = body.resource;
    const buyerEmail = resource?.payer?.email_address;
    const itemName =
      resource?.purchase_units?.[0]?.items?.[0]?.name || "Digital Product";

    if (!buyerEmail) {
      return res.status(400).json({ error: "Buyer email not found in event" });
    }

    const emailTemplate = await getEmailTemplate();
    const personalizedEmail = emailTemplate
      .replace(/{{itemName}}/g, itemName)
      .replace(/{{buyerEmail}}/g, buyerEmail);

    const resendResult = await sendEmail({
      to: buyerEmail,
      subject: `Your ${itemName} is ready!`,
      html: personalizedEmail,
    });

    return res.status(200).json({
      message: `Email sent to ${buyerEmail}`,
      resendId: resendResult.id,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// ✅ Export for Vercel
export default paypalWebhookHandler;

// ✅ AWS Lambda wrapper
export const handler = async (event) => {
  const req = {
    method: event.httpMethod,
    body: event.body,
  };
  const res = {
    status: (code) => ({
      json: (data) => ({
        statusCode: code,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    }),
  };
  return paypalWebhookHandler(req, res);
};
