import type { Config } from "drizzle-kit";

export default {
  schema: "./drizzle/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: 'postgres://postgres:postgres@localhost:5432/passage',
  },
  introspect: {
    casing: "preserve",
  },
  verbose: true,
  strict: true
} satisfies Config;
