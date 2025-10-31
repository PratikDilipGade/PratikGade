import fetch from "node-fetch";

/**
 * Universal PayPal webhook handler for Vercel or AWS Lambda.
 * - Extracts buyer email and purchased item info.
 * - Fetches email template from GitHub (cached for performance).
 * - Sends email via Resend API (no custom domain needed).
 */

let cachedEmailTemplate = null; // Cache template to reduce GitHub requests

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

async function paypalWebhookHandler(req, res) {
  try {
    // ✅ 1. Only POST requests
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // ✅ 2. Parse body safely
    let body;
    if (typeof req.body === "string") {
      try {
        body = JSON.parse(req.body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
      }
    } else {
      body = req.body;
    }

    // ✅ 3. Only handle payment completed events
    if (body.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
      return res.status(200).json({ message: "Ignored non-payment event" });
    }

    // ✅ 4. Extract buyer and product info
    const resource = body.resource;
    const buyerEmail = resource?.payer?.email_address;
    const itemName =
      resource?.purchase_units?.[0]?.items?.[0]?.name || "Digital Product";

    if (!buyerEmail) {
      return res.status(400).json({ error: "Buyer email not found in event" });
    }

    // ✅ 5. Get email template
    let emailTemplate;
    try {
      emailTemplate = await getEmailTemplate();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to fetch email template" });
    }

    // ✅ 6. Personalize email
    const personalizedEmail = emailTemplate
      .replace(/{{itemName}}/g, itemName)
      .replace(/{{buyerEmail}}/g, buyerEmail);

    // ✅ 7. Send email via Resend
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      return res.status(500).json({ error: "Resend API key not configured" });
    }

    const RESEND_EMAIL = "Your Store <onboarding@resend.dev>";

    let resendResult;
    try {
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: RESEND_EMAIL,
          to: buyerEmail,
          subject: `Your ${itemName} is ready!`,
          html: personalizedEmail,
        }),
      });

      if (!resendResponse.ok) {
        const text = await resendResponse.text();
        console.error("Resend API error response:", text);
        throw new Error(`Resend API error: ${resendResponse.status}`);
      }

      resendResult = await resendResponse.json();
    } catch (err) {
      console.error("Failed to send email via Resend:", err);
      return res.status(500).json({ error: "Failed to send email" });
    }

    // ✅ 8. Success
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
  return await paypalWebhookHandler(req, res);
};
