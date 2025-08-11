import type { Config } from "drizzle-kit";

export default {
  schema: "./drizzle/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DB_URL!,
  },
  introspect: {
    casing: "preserve",
  },
  verbose: true,
  strict: true
} satisfies Config;
