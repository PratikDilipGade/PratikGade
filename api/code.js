import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    if (body.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
      return res.status(200).json({ message: "Ignored non-payment event" });
    }

    const resource = body.resource;
    const buyerEmail = resource?.payer?.email_address;
    const itemName = resource?.purchase_units?.[0]?.items?.[0]?.name || "Digital Product";

    if (!buyerEmail) {
      return res.status(400).json({ error: "Buyer email not found in event" });
    }

    const GITHUB_EMAIL_URL =
      "https://raw.githubusercontent.com/PratikDilipGade/PratikGade/main/email.txt";

    const emailTemplateResponse = await fetch(GITHUB_EMAIL_URL);
    if (!emailTemplateResponse.ok) {
      throw new Error(`Failed to fetch email template: ${emailTemplateResponse.status}`);
    }
    const emailTemplate = await emailTemplateResponse.text();

    const personalizedEmail = emailTemplate
      .replace(/{{itemName}}/g, itemName)
      .replace(/{{buyerEmail}}/g, buyerEmail);

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const RESEND_EMAIL = "Your Store <onboarding@resend.dev>";

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

    const result = await resendResponse.json();

    return res.status(200).json({
      message: `Email sent to ${buyerEmail}`,
      resendId: result.id,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
