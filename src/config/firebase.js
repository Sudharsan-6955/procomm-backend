import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";

function fromEnv() {
	const projectId = process.env.FIREBASE_PROJECT_ID;
	const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
	const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

	if (!projectId || !clientEmail || !privateKey) {
		return null;
	}

	return admin.credential.cert({
		projectId,
		clientEmail,
		privateKey,
	});
}

function fromServiceAccountFile() {
	const servicePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
	if (!servicePath) {
		return null;
	}

	const absolutePath = path.isAbsolute(servicePath)
		? servicePath
		: path.resolve(process.cwd(), servicePath);

	if (!fs.existsSync(absolutePath)) {
		throw new Error(`FIREBASE_SERVICE_ACCOUNT_PATH not found: ${absolutePath}`);
	}

	const raw = fs.readFileSync(absolutePath, "utf-8");
	const parsed = JSON.parse(raw);

	return admin.credential.cert({
		projectId: parsed.project_id,
		clientEmail: parsed.client_email,
		privateKey: parsed.private_key,
	});
}

const credential = fromEnv() || fromServiceAccountFile();

if (!admin.apps.length) {
	if (credential) {
		admin.initializeApp({ credential });
	} else {
		throw new Error(
			"Firebase Admin credential missing. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY."
		);
	}
}

export const firebaseAdmin = admin;
