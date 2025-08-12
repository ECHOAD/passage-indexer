import { relations } from "drizzle-orm";
import { pgTable, varchar, integer, uuid, numeric } from "drizzle-orm/pg-core";
import { nft } from "./nft";
import { block } from "./block";

export const nftListing = pgTable(
  "nft_listing",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    owner: varchar("owner", { length: 255 }).notNull(),
    nft: uuid("nft")
      .references(() => nft.id)
      .notNull(),
    forSalePrice: numeric("for_sale_price"),
    forSaleDenom: varchar("for_sale_denom", { length: 255 }),
    forSaleBlockHeight: integer("for_sale_block_height").references(
      () => block.height
    ),
    unlistedBlockHeight: integer("unlisted_block_height").references(
      () => block.height
    ),
  },
  (table) => {
    return {};
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
}));

export type NftListing = typeof nftListing.$inferSelect;
export type NftListingInsert = typeof nftListing.$inferInsert;
