import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import messageRoutes from "./routes/message.routes.js";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware.js";
import { createRateLimiter, securityHeaders } from "./middleware/security.middleware.js";

const app = express();

const defaultOrigins = [
	"https://procomm-frontend.vercel.app",
	"http://localhost:3000",
	"http://127.0.0.1:3000",
];

const envOrigins = (process.env.CORS_ORIGINS || "")
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

const corsOptions = {
	origin: (origin, callback) => {
		if (!origin) {
			callback(null, true);
			return;
		}

		if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
			callback(null, true);
			return;
		}

		callback(new Error("Not allowed by CORS"));
	},
	methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization"],
};

const authRateLimiter = createRateLimiter({
	windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000),
	maxRequests: Number(process.env.AUTH_RATE_LIMIT_MAX || 50),
	keyPrefix: "auth",
});

app.use(cors(corsOptions));
app.use(express.json({ limit: "32kb" }));
app.use(securityHeaders);

app.get("/api/health", (_req, res) => {
	res.json({ ok: true });
});

app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/messages", messageRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
