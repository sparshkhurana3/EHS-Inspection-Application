import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import {
  environment,
} from "./config/environment.js";

import authRoutes from "./modules/auth/auth.routes.js";
import dashboardRoutes
  from "./modules/dashboard/dashboard.routes.js";
import observationRoutes
  from "./modules/observations/observation.routes.js";
import closureRoutes
  from "./modules/closures/closure.routes.js";
import patrolRoutes
  from "./modules/patrols/patrol.routes.js";
import ticketRoutes
  from "./modules/tickets/ticket.routes.js";

import {
  errorHandler,
  notFoundHandler,
} from "./middleware/errorHandler.js";

const app = express();

app.set("trust proxy", 1);

app.use(helmet());

app.use(
  cors({
    origin: environment.frontendOrigin,
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
    credentials: false,
  }),
);

app.use(
  express.json({
    limit: "1mb",
  }),
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "1mb",
  }),
);

if (
  environment.nodeEnvironment !==
  "test"
) {
  app.use(morgan("combined"));
}

app.get(
  "/api/health",
  (req, res) => {
    res.status(200).json({
      status: "healthy",
      service: "ehs-inspection-api",
      timestamp:
        new Date().toISOString(),
    });
  },
);

app.use(
  "/api/auth",
  authRoutes,
);

app.use(
  "/api/dashboard",
  dashboardRoutes,
);

app.use(
  "/api/observations",
  observationRoutes,
);

app.use(
  "/api/closures",
  closureRoutes,
);

app.use(
  "/api/patrols",
  patrolRoutes,
);

app.use(
  "/api/tickets",
  ticketRoutes,
);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;