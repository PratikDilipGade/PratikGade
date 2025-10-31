import fetch from "node-fetch";

/**
 * Universal PayPal webhook handler for Vercel or AWS Lambda.
 * 
 * - Extracts buyer email and purchased item info.
 * - Fetches email template from GitHub.
 * - Sends email via Resend API (no custom domain needed).
 */

export default async function handler(req, res) {
  try {
    // ✅ 1. Verify it's a POST request
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const body = req.body || JSON.parse(req.body);

    // ✅ 2. Check PayPal event type
    if (body.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
      return res.status(200).json({ message: "Ignored non-payment event" });
    }

    // ✅ 3. Extract buyer and product info
    const resource = body.resource;
    const buyerEmail = resource?.payer?.email_address;
    const itemName =
      resource?.purchase_units?.[0]?.items?.[0]?.name || "Digital Product";

    if (!buyerEmail) {
      return res.status(400).json({ error: "Buyer email not found in event" });
    }

    // ✅ 4. Fetch your ready-made email HTML from GitHub
    const GITHUB_EMAIL_URL =
      "https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/email-template.html"; // ⬅️ Replace this
    const emailTemplate = await fetch(GITHUB_EMAIL_URL).then((r) => r.text());

    // ✅ 5. Personalize email content
    const personalizedEmail = emailTemplate
      .replace(/{{itemName}}/g, itemName)
      .replace(/{{buyerEmail}}/g, buyerEmail);

    // ✅ 6. Send email via Resend (using default domain)
    const RESEND_API_KEY = process.env.RESEND_API_KEY; // ⬅️ Set this in your environment
    const RESEND_EMAIL = "Your Store <onboarding@resend.dev>"; // ⬅️ Use Resend’s default sender

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_EMAIL,
        to: buyerEmail,
        subject: `Your ${itemName} is ready!`,
        html: personalizedEmail,
      }),
    });

    const result = await resendResponse.json();

    // ✅ 7. Return success
    return res.status(200).json({
      message: `Email sent to ${buyerEmail}`,
      resendId: result.id,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// ✅ AWS Lambda compatibility (optional)
export const handler = async (event) => {
  const req = {
    method: event.httpMethod,
    body: event.body,
  };
  const res = {
    status: (code) => ({
      json: (data) => ({
        statusCode: code,
        body: JSON.stringify(data),
      }),
    }),
  };
  return await handler(req, res);
};
