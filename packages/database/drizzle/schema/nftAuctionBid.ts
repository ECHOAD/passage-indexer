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
import { nftAuction } from "./nftAuction";
import { block } from "./block";
import { transactionEvent } from "./transactionEvent";

export const nftAuctionBid = pgTable(
  "nft_auction_bid",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    auctionId: uuid("auction_id")
      .references(() => nftAuction.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      })
      .notNull(),
    bidder: varchar("bidder", { length: 255 }).notNull(),
    bidPrice: numeric("bid_price").notNull(),
    bidDenom: varchar("bid_denom", { length: 255 }).notNull(),
    bidBlockHeight: integer("bid_block_height")
      .references(() => block.height)
      .notNull(),
    refundedBlockHeight: integer("refunded_block_height").references(() => block.height),
    isHighest: boolean("is_highest").default(false).notNull(),
    transactionEventId: uuid("transaction_event_id").references(
      () => transactionEvent.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      }
    ),
  },
  (table) => ({
    auctionIdx: index("nft_auction_bid_auction_idx").on(table.auctionId),
    bidderIdx: index("nft_auction_bid_bidder_idx").on(table.bidder),
    txEventIdx: index("nft_auction_bid_tx_event_idx").on(table.transactionEventId),
    txEventUnique: uniqueIndex("nft_auction_bid_tx_event_unique").on(
      table.transactionEventId
    ),
  })
);

export const nftAuctionBidRelations = relations(nftAuctionBid, ({ one }) => ({
  auction: one(nftAuction, {
    fields: [nftAuctionBid.auctionId],
    references: [nftAuction.id],
  }),
  block: one(block, {
    fields: [nftAuctionBid.bidBlockHeight],
    references: [block.height],
  }),
  transactionEvent: one(transactionEvent, {
    fields: [nftAuctionBid.transactionEventId],
    references: [transactionEvent.id],
  }),
}));

export type NftAuctionBid = typeof nftAuctionBid.$inferSelect;
export type NftAuctionBidInsert = typeof nftAuctionBid.$inferInsert;
