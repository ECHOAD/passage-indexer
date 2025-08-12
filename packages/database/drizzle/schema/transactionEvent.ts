import { pgTable, uuid, varchar, integer, index } from "drizzle-orm/pg-core";
import { block } from "./block";
import { relations } from "drizzle-orm";
import { transaction } from "./transaction";
import {
  TransactionEventAttribute,
  transactionEventAttribute,
} from "./transactionEventAttribute";

export const transactionEvent = pgTable(
  "transaction_event",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    height: integer("height")
      .notNull()
      .references(() => block.height),
    txId: uuid("tx_id")
      .notNull()
      .references(() => transaction.id, { onUpdate: "cascade" }),
    msgIndex: integer("msg_index").notNull(),
    index: integer("index").notNull(),
    type: varchar("type", { length: 255 }).notNull(),
  },
  (table) => ({
    heightIndex: index("transaction_event_height_index").on(
      table.height,
      table.index
    ),
    txIdIndex: index("transaction_event_tx_id_index").on(
      table.txId,
      table.index
    ),
  })
);

export const transactionEventRelations = relations(
  transactionEvent,
  ({ many, one }) => ({
    attributes: many(transactionEventAttribute),
    block: one(block, {
      references: [block.height],
      fields: [transactionEvent.height],
    }),
    transaction: one(transaction, {
      references: [transaction.id],
      fields: [transactionEvent.txId],
    }),
  })
);

export type TransactionEvent = typeof transactionEvent.$inferSelect;
export type TransactionEventWithAttributes = TransactionEvent & {
  attributes: TransactionEventAttribute[];
};
export type TransactionEventInsert = typeof transactionEvent.$inferInsert;
