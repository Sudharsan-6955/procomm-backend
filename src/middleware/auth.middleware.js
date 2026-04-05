import { firebaseAdmin } from "../config/firebase.js";
import User from "../models/user.model.js";
import { verifySessionToken } from "../services/auth-helper.service.js";

function getBearerToken(header) {
	if (!header || !header.startsWith("Bearer ")) {
		return null;
	}
	return header.slice(7);
}

export async function requireAuth(req, _res, next) {
	try {
		const token = getBearerToken(req.headers.authorization);
		if (!token) {
			const error = new Error("Missing authorization token");
			error.statusCode = 401;
			throw error;
		}

		let user = null;

		// Try Firebase token first
		try {
			const decoded = await firebaseAdmin.auth().verifyIdToken(token);
			user = await User.findOne({ firebaseUid: decoded.uid });
			if (user) {
				req.auth = decoded;
				req.user = user;
				return next();
			}
		} catch {
			// Fall through to phone login token
		}

		// Try signed session token (HMAC)
		const decodedSession = verifySessionToken(token);
		if (decodedSession?.uid) {
			user = await User.findById(decodedSession.uid);
			if (user) {
				req.auth = decodedSession;
				req.user = user;
				return next();
			}
		}

		const error = new Error("Invalid or expired token");
		error.statusCode = 401;
		throw error;
	} catch (err) {
		next(err);
	}
}
