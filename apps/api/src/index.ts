import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { db } from "database";
import { apiRouter } from "./routers/apiRouter";

const app = new Hono();

const { PORT = "3001" } = process.env;

app.route("/", apiRouter);

serve(
  {
    fetch: app.fetch,
    port: parseInt(PORT!),
  },
  (info) => {
    console.log(`Listening on http://localhost:${info.port}`); // Listening on http://localhost:3000
  }
);
