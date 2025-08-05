import { isNull, relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  integer,
  uuid,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { nft } from "./nft";
import { block } from "./block";

export const nftBid = pgTable(
  "nft_bid",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    owner: varchar("owner", { length: 255 }).notNull(),
    nft: uuid("nft")
      .references(() => nft.id)
      .notNull(),
    bidPrice: numeric("bid_price"),
    bidDenom: varchar("bid_denom", { length: 255 }),
    bidBlockHeight: integer("bid_block_height").references(() => block.height),
    removedBlockHeight: integer("removed_block_height").references(
      () => block.height
    ),
  },
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
}));

export type NftBid = typeof nftBid.$inferSelect;
export type NftBidInsert = typeof nftBid.$inferInsert;
