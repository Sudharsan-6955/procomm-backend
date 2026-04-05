export function notFoundHandler(req, _res, next) {
	const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
	error.statusCode = 404;
	next(error);
}

export function errorHandler(err, _req, res, _next) {
	let statusCode = err.statusCode || 500;
	let message = err.message || "Internal server error";

	const mongoAuthError =
		err?.name === "MongoServerError" &&
		(err?.code === 13 || /requires authentication/i.test(String(err?.message || "")));
	const mongoDuplicatePhone =
		err?.name === "MongoServerError" &&
		err?.code === 11000 &&
		String(err?.message || "").includes("phoneNumber_1");
	const mongoDuplicateEmail =
		err?.name === "MongoServerError" &&
		err?.code === 11000 &&
		String(err?.message || "").includes("email_1");

	if (mongoAuthError) {
		statusCode = 500;
		message =
			"MongoDB authentication failed. Update MONGODB_URI with valid username/password and authSource.";
	} else if (mongoDuplicatePhone) {
		statusCode = 409;
		message = "Phone number already linked to another account.";
	} else if (mongoDuplicateEmail) {
		statusCode = 409;
		message = "Email already linked to another account.";
	}

	res.status(statusCode).json({
		message,
	});
}
