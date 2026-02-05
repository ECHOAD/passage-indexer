import { relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  integer,
  uuid,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { nft } from "./nft";
import { block } from "./block";
import { transactionEvent } from "./transactionEvent";

export const nftBid = pgTable(
  "nft_bid",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    owner: varchar("owner", { length: 255 }).notNull(),
    marketContract: varchar("market_contract", { length: 255 }),
    nft: uuid("nft")
      .references(() => nft.id)
      .notNull(),
    rawTokenId: varchar("raw_token_id", { length: 255 }).notNull(),
    bidPrice: numeric("bid_price"),
    bidDenom: varchar("bid_denom", { length: 255 }),
    bidBlockHeight: integer("bid_block_height").references(() => block.height),
    removedBlockHeight: integer("removed_block_height").references(
      () => block.height
    ),
    transactionEventId: uuid("transaction_event_id").references(
      () => transactionEvent.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      }
    ),
  },
  (table) => ({
    nftIdx: index("nft_bid_nft_idx").on(table.nft),
    marketIdx: index("nft_bid_market_idx").on(table.marketContract),
    txEventIdx: index("nft_bid_tx_event_idx").on(table.transactionEventId),
    txEventUnique: uniqueIndex("nft_bid_tx_event_unique").on(
      table.transactionEventId
    ),
  })
);

export const nftBidRelations = relations(nftBid, ({ one }) => ({
  nft: one(nft, {
    fields: [nftBid.nft],
    references: [nft.id],
  }),
  block: one(block, {
    fields: [nftBid.bidBlockHeight],
    references: [block.height],
  }),
  removedBlock: one(block, {
    fields: [nftBid.removedBlockHeight],
    references: [block.height],
  }),
  transactionEvent: one(transactionEvent, {
    fields: [nftBid.transactionEventId],
    references: [transactionEvent.id],
  }),
}));

export type NftBid = typeof nftBid.$inferSelect;
export type NftBidInsert = typeof nftBid.$inferInsert;
