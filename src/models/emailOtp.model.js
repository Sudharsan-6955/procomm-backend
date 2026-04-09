import mongoose from "mongoose";

const emailOtpSchema = new mongoose.Schema(
	{
		email: {
			type: String,
			required: true,
			trim: true,
			lowercase: true,
			index: true,
		},
		otpHash: {
			type: String,
			required: true,
		},
		expiresAt: {
			type: Date,
			required: true,
		},
		attempts: {
			type: Number,
			default: 0,
		},
	},
	{ timestamps: true, collection: "emailotps" }
);

emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EmailOtp = mongoose.model("EmailOtp", emailOtpSchema);

export default EmailOtp;
