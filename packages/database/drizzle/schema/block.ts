import { eq, relations, sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  integer,
  boolean,
  bigint,
} from "drizzle-orm/pg-core";
import { transaction } from "./transaction";
import { blockEvent } from "./blockEvent";
import { day } from "./day";

export const block = pgTable(
  "block",
  {
    height: integer("height").primaryKey().notNull(),
    datetime: timestamp("datetime", {
      mode: "date",
    }).notNull(),
    hash: varchar("hash", { length: 255 }).notNull(),
    parentHash: varchar("parent_hash", { length: 255 }),
    proposer: varchar("proposer", { length: 255 }).notNull(),
    dayId: uuid("day_id")
      .references(() => day.id)
      .notNull(),
    txCount: integer("tx_count").notNull(),
    isProcessed: boolean("is_processed").default(false).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    totalTxCount: bigint("total_tx_count", { mode: "number" }).notNull(),
  },
  (table) => {
    return {
      datetime: index("block_datetime").on(table.datetime),
      day_id: index("block_day_id").on(table.dayId),
      height_is_processed: index("block_height_is_processed").on(
        table.height,
        table.isProcessed
      ),
      height_where_is_processed_false: index(
        "block_height_where_is_processed_false"
      )
        .on(table.height)
        .where(sql.raw(`${table.isProcessed.name} = false`)), // TODO: Change to eq() when bug is fixed: https://github.com/drizzle-team/drizzle-orm/issues/2508
    };
  }
);

export const blockRelations = relations(block, ({ many, one }) => ({
  day: one(day, { fields: [block.dayId], references: [day.id] }),
  transactions: many(transaction),
  events: many(blockEvent),
}));

export type Block = typeof block.$inferSelect;
export type BlockInsert = typeof block.$inferInsert;
