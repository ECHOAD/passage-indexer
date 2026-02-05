import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { collection } from "./collection";
import { nft } from "./nft";
import { block } from "./block";
import { transaction } from "./transaction";
import { transactionEvent } from "./transactionEvent";
import { nftAuctionBid } from "./nftAuctionBid";

export const nftAuctionStatusEnum = pgEnum("nft_auction_status", [
  "active",
  "closed",
  "finalized",
  "voided",
]);

export const nftAuction = pgTable(
  "nft_auction",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    auctionContract: varchar("auction_contract", { length: 255 }).notNull(),
    collection: varchar("collection", { length: 255 })
      .references(() => collection.address, {
        onDelete: "cascade",
        onUpdate: "cascade",
      })
      .notNull(),
    nftId: uuid("nft_id")
      .references(() => nft.id, {
        onDelete: "set null",
        onUpdate: "cascade",
      }),
    tokenId: integer("token_id"),
    rawTokenId: varchar("raw_token_id", { length: 255 }).notNull(),
    seller: varchar("seller", { length: 255 }).notNull(),
    startTime: timestamp("start_time", { withTimezone: true, mode: "date" }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true, mode: "date" }).notNull(),
    startingPrice: numeric("starting_price").notNull(),
    startingDenom: varchar("starting_denom", { length: 255 }).notNull(),
    reservePrice: numeric("reserve_price"),
    reserveDenom: varchar("reserve_denom", { length: 255 }),
    highestBidPrice: numeric("highest_bid_price"),
    highestBidDenom: varchar("highest_bid_denom", { length: 255 }),
    highestBidder: varchar("highest_bidder", { length: 255 }),
    highestBidBlockHeight: integer("highest_bid_block_height").references(
      () => block.height
    ),
    status: nftAuctionStatusEnum("status").default("active").notNull(),
    createdBlockHeight: integer("created_block_height")
      .references(() => block.height)
      .notNull(),
    closedBlockHeight: integer("closed_block_height").references(() => block.height),
    finalizedBlockHeight: integer("finalized_block_height").references(
      () => block.height
    ),
    voidedBlockHeight: integer("voided_block_height").references(() => block.height),
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
    auctionContractIdx: index("nft_auction_contract_idx").on(table.auctionContract),
    collectionIdx: index("nft_auction_collection_idx").on(table.collection),
    statusIdx: index("nft_auction_status_idx").on(table.status),
    endTimeIdx: index("nft_auction_end_time_idx").on(table.endTime),
    txEventIdx: index("nft_auction_tx_event_idx").on(table.transactionEventId),
    txEventUnique: uniqueIndex("nft_auction_tx_event_unique").on(
      table.transactionEventId
    ),
  })
);

export const nftAuctionRelations = relations(nftAuction, ({ one, many }) => ({
  collection: one(collection, {
    fields: [nftAuction.collection],
    references: [collection.address],
  }),
  nft: one(nft, {
    fields: [nftAuction.nftId],
    references: [nft.id],
  }),
  createdBlock: one(block, {
    fields: [nftAuction.createdBlockHeight],
    references: [block.height],
  }),
  transaction: one(transaction, {
    fields: [nftAuction.transactionId],
    references: [transaction.id],
  }),
  transactionEvent: one(transactionEvent, {
    fields: [nftAuction.transactionEventId],
    references: [transactionEvent.id],
  }),
  bids: many(nftAuctionBid),
}));

export type NftAuction = typeof nftAuction.$inferSelect;
export type NftAuctionInsert = typeof nftAuction.$inferInsert;
