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

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim().replace(/\/+$/, ""))
  : "*";

// Define origins dynamically but strictly
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim().replace(/\/+$/, ""))
  : ["*"];

console.log("CORS allowed origins:", allowedOrigins);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

// Apply to options/preflight first, then global middleware
app.options("*", cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/patients", patientRoutes);
app.use("/encounters", encounterRoutes);
app.use("/queue", queueRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/theatre", theatreRoutes);
app.use("/wards", wardRoutes);
app.use("/reports", reportRoutes);
app.use("/catalog", catalogRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`Clinicore API listening on port ${port}`));
