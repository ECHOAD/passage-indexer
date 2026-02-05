import { pgTable, varchar, numeric, timestamp } from "drizzle-orm/pg-core";

export const syncState = pgTable("sync_state", {
  key: varchar("key", { length: 128 }).primaryKey().notNull(),
  value: numeric("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

export type SyncState = typeof syncState.$inferSelect;
export type SyncStateInsert = typeof syncState.$inferInsert;
