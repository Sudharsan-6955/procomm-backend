import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
	{
		firebaseUid: {
			type: String,
			trim: true,
		},
		phoneNumber: {
			type: String,
			trim: true,
		},
		email: {
			type: String,
			trim: true,
			lowercase: true,
		},
		name: {
			type: String,
			default: "New User",
		},
		about: {
			type: String,
			default: "",
			maxlength: 50,
		},
		profilePic: {
			type: String,
			default: "https://i.pravatar.cc/150?img=5",
		},
		instagram: {
			type: String,
			default: "",
		},
		facebook: {
			type: String,
			default: "",
		},
		github: {
			type: String,
			default: "",
		},
		linkedin: {
			type: String,
			default: "",
		},
		lastSeenAt: {
			type: Date,
			default: Date.now,
		},
		authProvider: {
			type: String,
			enum: ["phone", "email", "google"],
			default: "phone",
		},
		fcmTokens: {
			type: [String],
			default: [],
		},
	},
	{ timestamps: true }
);

userSchema.index(
	{ firebaseUid: 1 },
	{ unique: true, partialFilterExpression: { firebaseUid: { $type: "string" } } }
);
userSchema.index(
	{ phoneNumber: 1 },
	{ unique: true, partialFilterExpression: { phoneNumber: { $type: "string" } } }
);
userSchema.index(
	{ email: 1 },
	{ unique: true, partialFilterExpression: { email: { $type: "string" } } }
);

const User = mongoose.model("User", userSchema);

export default User;
