import nodemailer from "nodemailer";

let cachedTransporter = null;

function resolveSmtpConfig() {
	const host = process.env.SMTP_HOST;
	const port = Number(process.env.SMTP_PORT || 587);
	const user = process.env.SMTP_USER;
	const pass = String(process.env.SMTP_PASS || "").replace(/\s+/g, "");
	const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
	const isGmail = String(host || "").toLowerCase().includes("gmail.com");

	if (!host || !user || !pass) {
		return null;
	}

	if (isGmail && pass.length !== 16) {
		const error = new Error(
			"Invalid SMTP_PASS for Gmail. Use a 16-character Google App Password (spaces are optional)."
		);
		error.statusCode = 400;
		throw error;
	}

	return {
		host,
		port,
		secure,
		auth: { user, pass },
	};
}

function getTransporter() {
	if (cachedTransporter) {
		return cachedTransporter;
	}

	const smtpConfig = resolveSmtpConfig();
	if (!smtpConfig) {
		return null;
	}

	cachedTransporter = nodemailer.createTransport(smtpConfig);
	return cachedTransporter;
}

export async function sendOtpMail({ toEmail, otp }) {
	const transporter = getTransporter();
	if (!transporter) {
		const error = new Error("Email service is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.");
		error.statusCode = 500;
		throw error;
	}

	const from = process.env.SMTP_FROM || process.env.SMTP_USER;

	try {
		await transporter.sendMail({
			from,
			to: toEmail,
			subject: "Your ProComm login code",
			text: `Your ProComm OTP is ${otp}. This code expires in 10 minutes.`,
			html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>ProComm Login OTP</h2><p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p><p>This code expires in 10 minutes.</p></div>`,
		});
	} catch (error) {
		const message = String(error?.message || "");
		if (error?.code === "EAUTH" || /535\s*5\.7\.8|badcredentials/i.test(message)) {
			const friendly = new Error(
				"SMTP login failed for Gmail. Use a valid 16-character Google App Password (not your normal Gmail password), confirm 2-Step Verification is enabled, and ensure SMTP_USER matches the same Gmail account."
			);
			friendly.statusCode = 401;
			throw friendly;
		}

		throw error;
	}
}
