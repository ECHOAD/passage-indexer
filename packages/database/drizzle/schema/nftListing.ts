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

export const nftListing = pgTable(
  "nft_listing",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    owner: varchar("owner", { length: 255 }).notNull(),
    marketContract: varchar("market_contract", { length: 255 }),
    nft: uuid("nft")
      .references(() => nft.id)
      .notNull(),
    rawTokenId: varchar("raw_token_id", { length: 255 }).notNull(),
    forSalePrice: numeric("for_sale_price"),
    forSaleDenom: varchar("for_sale_denom", { length: 255 }),
    forSaleBlockHeight: integer("for_sale_block_height").references(
      () => block.height
    ),
    unlistedBlockHeight: integer("unlisted_block_height").references(
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
  (table) => {
    return {
      nftIdx: index("nft_listing_nft_idx").on(table.nft),
      marketIdx: index("nft_listing_market_idx").on(table.marketContract),
      txEventIdx: index("nft_listing_tx_event_idx").on(table.transactionEventId),
      txEventUnique: uniqueIndex("nft_listing_tx_event_unique").on(
        table.transactionEventId
      ),
    };
  }
);

export const nftListingRelations = relations(nftListing, ({ one }) => ({
  nft: one(nft, {
    fields: [nftListing.nft],
    references: [nft.id],
  }),
  block: one(block, {
    fields: [nftListing.forSaleBlockHeight],
    references: [block.height],
  }),
  unlistedBlock: one(block, {
    fields: [nftListing.unlistedBlockHeight],
    references: [block.height],
  }),
  transactionEvent: one(transactionEvent, {
    fields: [nftListing.transactionEventId],
    references: [transactionEvent.id],
  }),
}));

export type NftListing = typeof nftListing.$inferSelect;
export type NftListingInsert = typeof nftListing.$inferInsert;
