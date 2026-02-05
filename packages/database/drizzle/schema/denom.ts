import { relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { denomRate } from "./denomRate";

export const denom = pgTable(
  "denom",
  {
    denom: varchar("denom", { length: 255 }).primaryKey().notNull(),
    displayDenom: varchar("display_denom", { length: 255 }),
    baseDenom: varchar("base_denom", { length: 255 }),
    decimals: integer("decimals").default(6).notNull(),
    symbol: varchar("symbol", { length: 64 }),
    coingeckoId: varchar("coingecko_id", { length: 255 }),
    isNative: boolean("is_native").default(false).notNull(),
    isIbc: boolean("is_ibc").default(false).notNull(),
    isConvertible: boolean("is_convertible").default(false).notNull(),
    chainId: varchar("chain_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    displayIdx: index("denom_display_idx").on(table.displayDenom),
    baseIdx: index("denom_base_idx").on(table.baseDenom),
    cgIdx: index("denom_cg_idx").on(table.coingeckoId),
  })
);

export const denomRelations = relations(denom, ({ many }) => ({
  rates: many(denomRate),
}));

export type Denom = typeof denom.$inferSelect;
export type DenomInsert = typeof denom.$inferInsert;
