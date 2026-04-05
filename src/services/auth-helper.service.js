import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function getSessionSecret() {
	if (process.env.SESSION_SECRET) {
		return process.env.SESSION_SECRET;
	}

	if (process.env.NODE_ENV === "production") {
		throw new Error("SESSION_SECRET is required in production");
	}

	return "dev-only-session-secret-change-me";
}

export function getBearerToken(header) {
	if (!header || !header.startsWith("Bearer ")) {
		return null;
	}
	return header.slice(7);
}

export function normalizeEmail(rawEmail) {
	return String(rawEmail || "").trim().toLowerCase();
}

export function isValidEmail(email) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function hashOtp(email, otp) {
	return createHash("sha256").update(`${email}:${otp}`).digest("hex");
}

export function issueSessionToken(user) {
	const secret = getSessionSecret();

	const issuedAt = Math.floor(Date.now() / 1000);
	const expiresIn = Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 7);
	const payload = {
		uid: String(user._id),
		email: user.email || null,
		iat: issuedAt,
		exp: issuedAt + Math.max(expiresIn, 60),
	};

	const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
	const signature = createHmac("sha256", secret).update(payloadBase64).digest("base64url");
	return `${payloadBase64}.${signature}`;
}

export function verifySessionToken(token) {
	if (!token || typeof token !== "string") {
		return null;
	}

	let secret;
	try {
		secret = getSessionSecret();
	} catch {
		return null;
	}

	const [payloadBase64, providedSignature] = token.split(".");
	if (!payloadBase64 || !providedSignature) {
		return null;
	}

	const expectedSignature = createHmac("sha256", secret).update(payloadBase64).digest("base64url");
	const providedBuffer = Buffer.from(providedSignature);
	const expectedBuffer = Buffer.from(expectedSignature);
	if (
		providedBuffer.length !== expectedBuffer.length ||
		!timingSafeEqual(providedBuffer, expectedBuffer)
	) {
		return null;
	}

	try {
		const decoded = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
		if (!decoded?.uid || typeof decoded.exp !== "number") {
			return null;
		}

		const now = Math.floor(Date.now() / 1000);
		if (decoded.exp <= now) {
			return null;
		}

		return decoded;
	} catch {
		return null;
	}
}
