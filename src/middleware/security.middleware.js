const requestBuckets = new Map();

function getClientKey(req) {
	const forwarded = req.headers["x-forwarded-for"];
	if (typeof forwarded === "string" && forwarded.trim()) {
		return forwarded.split(",")[0].trim();
	}
	return req.ip || req.socket?.remoteAddress || "unknown";
}

export function securityHeaders(req, res, next) {
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("X-Frame-Options", "DENY");
	res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
	res.setHeader("X-XSS-Protection", "0");
	res.setHeader("Cross-Origin-Resource-Policy", "same-site");

	if (process.env.NODE_ENV === "production") {
		res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
	}

	next();
}

export function createRateLimiter({ windowMs, maxRequests, keyPrefix = "rl" }) {
	const normalizedWindowMs = Math.max(Number(windowMs) || 0, 1000);
	const normalizedMaxRequests = Math.max(Number(maxRequests) || 0, 1);

	return function rateLimiter(req, res, next) {
		if (req.method === "OPTIONS") {
			next();
			return;
		}

		const key = `${keyPrefix}:${getClientKey(req)}`;
		const now = Date.now();
		const current = requestBuckets.get(key);

		if (!current || now >= current.resetAt) {
			requestBuckets.set(key, {
				count: 1,
				resetAt: now + normalizedWindowMs,
			});
			next();
			return;
		}

		if (current.count >= normalizedMaxRequests) {
			const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
			res.setHeader("Retry-After", String(Math.max(retryAfterSeconds, 1)));
			res.status(429).json({ message: "Too many requests. Please try again shortly." });
			return;
		}

		current.count += 1;
		requestBuckets.set(key, current);
		next();
	};
}
