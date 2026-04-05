import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
	{
		chatId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Chat",
			required: true,
			index: true,
		},
		senderId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		text: {
			type: String,
			required: true,
			trim: true,
		},
		mentions: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "User",
			},
		],
		isEdited: {
			type: Boolean,
			default: false,
		},
		editedAt: {
			type: Date,
			default: null,
		},
		favoritedBy: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "User",
			},
		],
		pinnedBy: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "User",
			},
		],
		deletedFor: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "User",
			},
		],
		deletedForEveryone: {
			isDeleted: {
				type: Boolean,
				default: false,
			},
			deletedAt: {
				type: Date,
				default: null,
			},
			deletedBy: {
				type: mongoose.Schema.Types.ObjectId,
				ref: "User",
				default: null,
			},
		},
		deliveryStatus: {
			status: {
				type: String,
				enum: ["sent", "delivered", "read"],
				default: "sent",
				index: true,
			},
			deliveredAt: {
				type: Date,
				default: null,
			},
			readAt: {
				type: Date,
				default: null,
			},
		},
	},
	{ timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);

export default Message;
