export function toUserPayload(user) {
	return {
		_id: String(user._id),
		firebaseUid: user.firebaseUid || null,
		phoneNumber: user.phoneNumber || "",
		email: user.email || "",
		name: user.name,
		about: user.about || "",
		profilePic: user.profilePic,
		instagram: user.instagram || "",
		facebook: user.facebook || "",
		github: user.github || "",
		linkedin: user.linkedin || "",
		authProvider: user.authProvider || "phone",
		lastSeenAt: user.lastSeenAt,
	};
}
