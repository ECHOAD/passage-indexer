import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { nft } from "./nft";
import { block } from "./block";
import { transaction } from "./transaction";
import { transactionEvent } from "./transactionEvent";

export const nftMint = pgTable(
  "nft_mint",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    nftId: uuid("nft_id")
      .references(() => nft.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      })
      .notNull(),
    minter: varchar("minter", { length: 255 }).notNull(),
    recipient: varchar("recipient", { length: 255 }).notNull(),
    mintPrice: numeric("mint_price"),
    mintDenom: varchar("mint_denom", { length: 255 }),
    mintBlockHeight: integer("mint_block_height")
      .references(() => block.height)
      .notNull(),
    isAirdrop: boolean("is_airdrop").default(false).notNull(),
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
  (table) => ({
    nftIdx: index("nft_mint_nft_idx").on(table.nftId),
    blockIdx: index("nft_mint_block_idx").on(table.mintBlockHeight),
    txEventIdx: index("nft_mint_tx_event_idx").on(table.transactionEventId),
    txEventUnique: uniqueIndex("nft_mint_tx_event_unique").on(
      table.transactionEventId
    ),
  })
);

export const nftMintRelations = relations(nftMint, ({ one }) => ({
  nft: one(nft, {
    fields: [nftMint.nftId],
    references: [nft.id],
  }),
  block: one(block, {
    fields: [nftMint.mintBlockHeight],
    references: [block.height],
  }),
  transaction: one(transaction, {
    fields: [nftMint.transactionId],
    references: [transaction.id],
  }),
  transactionEvent: one(transactionEvent, {
    fields: [nftMint.transactionEventId],
    references: [transactionEvent.id],
  }),
}));

export type NftMint = typeof nftMint.$inferSelect;
export type NftMintInsert = typeof nftMint.$inferInsert;
