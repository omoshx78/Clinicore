import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import patientRoutes from "./routes/patients.routes";
import encounterRoutes from "./routes/encounters.routes";
import queueRoutes from "./routes/queue.routes";
import inventoryRoutes from "./routes/inventory.routes";
import theatreRoutes from "./routes/theatre.routes";
import wardRoutes from "./routes/wards.routes";
import reportRoutes from "./routes/reports.routes";
import catalogRoutes from "./routes/catalog.routes";

const app = express();

// Parse allowed origins cleanly
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim().replace(/\/+$/, ""))
  : ["*"];

console.log("CORS allowed origins:", allowedOrigins);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like server-to-server or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200 // Ensures preflight OPTIONS requests return a successful 200 status code
};

// Apply CORS preflight handler and middleware at the very top
app.options("*", cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => res.json({ ok: true }));

// Application Routes
app.use("/auth", authRoutes);
app.use("/patients", patientRoutes);
app.use("/encounters", encounterRoutes);
app.use("/queue", queueRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/theatre", theatreRoutes);
app.use("/wards", wardRoutes);
app.use("/reports", reportRoutes);
app.use("/catalog", catalogRoutes);

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Server Error:", err);
  res.status(500).json({ error: "Something went wrong on the server" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`Clinicore API listening on port ${port}`));
