import { relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  integer,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { nft } from "./nft";
import { block } from "./block";
import { transaction } from "./transaction";
import { transactionEvent } from "./transactionEvent";

export const nftTransfer = pgTable(
  "nft_transfer",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    fromOwner: varchar("from_owner", { length: 255 }).notNull(),
    toOwner: varchar("to_owner", { length: 255 }).notNull(),
    transferredOnBlockHeight: integer("transferred_on_block_height").notNull(),
    nftId: uuid("nft_id")
      .references(() => nft.id)
      .notNull(),
    transactionId: uuid("transaction_id").references(() => transaction.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    transactionEventId: uuid("transaction_event_id").references(
      () => transactionEvent.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      }
    ),
  },
  (table) => {
    return {
      nftIdx: index("nft_transfer_nft_idx").on(table.nftId),
      txEventIdx: index("nft_transfer_tx_event_idx").on(table.transactionEventId),
      txEventUnique: uniqueIndex("nft_transfer_tx_event_unique").on(
        table.transactionEventId
      ),
    };
  }
);

export const nftTransferRelations = relations(nftTransfer, ({ one }) => ({
  nft: one(nft, {
    fields: [nftTransfer.nftId],
    references: [nft.id],
  }),
  block: one(block, {
    fields: [nftTransfer.transferredOnBlockHeight],
    references: [block.height],
  }),
  transaction: one(transaction, {
    fields: [nftTransfer.transactionId],
    references: [transaction.id],
  }),
  transactionEvent: one(transactionEvent, {
    fields: [nftTransfer.transactionEventId],
    references: [transactionEvent.id],
  }),
}));

export type NftTransfer = typeof nftTransfer.$inferSelect;
export type NftTransferInsert = typeof nftTransfer.$inferInsert;
