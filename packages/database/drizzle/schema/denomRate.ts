import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  date,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { denom } from "./denom";

export const denomRate = pgTable(
  "denom_rate",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    denom: varchar("denom", { length: 255 })
      .references(() => denom.denom, {
        onDelete: "cascade",
        onUpdate: "cascade",
      })
      .notNull(),
    date: date("date", { mode: "date" }).notNull(),
    usdPrice: numeric("usd_price"),
    source: varchar("source", { length: 255 }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    denomIdx: index("denom_rate_denom_idx").on(table.denom),
    dateIdx: index("denom_rate_date_idx").on(table.date),
    denomDateUnique: uniqueIndex("denom_rate_denom_date_unique").on(
      table.denom,
      table.date
    ),
  })
);

export const denomRateRelations = relations(denomRate, ({ one }) => ({
  denom: one(denom, {
    fields: [denomRate.denom],
    references: [denom.denom],
  }),
}));

export type DenomRate = typeof denomRate.$inferSelect;
export type DenomRateInsert = typeof denomRate.$inferInsert;
