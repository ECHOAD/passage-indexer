import { relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  index,
  integer,
  json,
  uuid,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { collection } from "./collection";
import { block } from "./block";
import { nftBid } from "./nftBid";
import { nftTransfer } from "./nftTransfer";
import { nftListing } from "./nftListing";
import { nftToTrait } from "./nftTrait";
import { nftSale } from "./nftSale";

export const nft = pgTable(
  "nft",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    tokenId: integer("token_id").notNull(),
    rawTokenId: varchar("raw_token_id", { length: 255 }).notNull(),
    owner: varchar("owner", { length: 255 }),
    image: varchar("image", { length: 255 }),
    name: varchar("name", { length: 255 }),
    description: varchar("description", { length: 1000 }),
    externalUrl: varchar("external_url", { length: 255 }),
    backgroundColor: varchar("background_color", { length: 255 }),
    animationUrl: varchar("animation_url", { length: 255 }),
    youtubeUrl: varchar("youtube_url", { length: 255 }),
    metadata: json("metadata").notNull(),
    createdOnBlockHeight: integer("created_on_block_height").references(
      () => block.height,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      }
    ),
    mintedOnBlockHeight: integer("minted_on_block_height").references(
      () => block.height,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      }
    ),
    airDroppedOnBlockHeight: integer("airdropped_on_block_height").references(
      () => block.height,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      }
    ),
    migratedOnBlockHeight: integer("migrated_on_block_height").references(
      () => block.height,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      }
    ),
    mintPrice: numeric("mint_price"),
    mintDenom: varchar("mint_denom", { length: 255 }),
    collection: varchar("collection", { length: 255 }).references(
      () => collection.address,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      }
    ),
    activeListingId: uuid("active_listing_id"),
  },
  (table) => {
    return {
      collectionTokenId: uniqueIndex("nft_collection_token_id").on(
        table.collection,
        table.tokenId
      ),
      mintedOnBlockHeight: index("nft_minted_on_block_height").on(
        table.mintedOnBlockHeight
      ),
      owner: index("nft_owner").on(table.owner),
    };
  }
);

export const nftRelations = relations(nft, ({ one, many }) => ({
  collection: one(collection, {
    fields: [nft.collection],
    references: [collection.address],
  }),
  minted_on_block: one(block, {
    fields: [nft.mintedOnBlockHeight],
    references: [block.height],
  }),
  activeListing: one(nftListing, {
    fields: [nft.activeListingId],
    references: [nftListing.id],
  }),
  bids: many(nftBid),
  transfers: many(nftTransfer),
  listings: many(nftListing),
  nftToTraits: many(nftToTrait),
  sales: many(nftSale),
}));

export type Nft = typeof nft.$inferSelect;
export type NftInsert = typeof nft.$inferInsert;
