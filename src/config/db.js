import mongoose from "mongoose";

const expectedUserIndexes = [
	{
		field: "firebaseUid",
		key: { firebaseUid: 1 },
		options: { unique: true, partialFilterExpression: { firebaseUid: { $type: "string" } } },
	},
	{
		field: "phoneNumber",
		key: { phoneNumber: 1 },
		options: { unique: true, partialFilterExpression: { phoneNumber: { $type: "string" } } },
	},
	{
		field: "email",
		key: { email: 1 },
		options: { unique: true, partialFilterExpression: { email: { $type: "string" } } },
	},
];

async function ensureUserIndexes() {
	const collection = mongoose.connection.db.collection("users");
	const indexes = await collection.indexes();

	for (const expected of expectedUserIndexes) {
		const currentIndex = indexes.find((index) => {
			const keys = Object.keys(index.key || {});
			return keys.length === 1 && keys[0] === expected.field;
		});

		const hasExpectedPartialFilter =
			currentIndex &&
			currentIndex.unique === true &&
			JSON.stringify(currentIndex.partialFilterExpression || {}) ===
				JSON.stringify(expected.options.partialFilterExpression);

		if (!currentIndex) {
			await collection.createIndex(expected.key, expected.options);
			continue;
		}

		if (!hasExpectedPartialFilter) {
			await collection.dropIndex(currentIndex.name);
			await collection.createIndex(expected.key, expected.options);
		}
	}
}

export async function connectDb() {
	const uri = process.env.MONGODB_URI;

	if (!uri) {
		throw new Error("MONGODB_URI is not configured");
	}

	await mongoose.connect(uri);
	await ensureUserIndexes();
	console.log("MongoDB connected");
}