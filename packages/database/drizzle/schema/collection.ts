import { relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  timestamp,
  index,
  integer,
  uuid,
  numeric,
} from "drizzle-orm/pg-core";
import { whitelist } from "./whiteList";
import { nft } from "./nft";
import { nftCollectionBid } from "./nftCollectionBid";

export const collection = pgTable(
  "collection",
  {
    address: varchar("address", { length: 255 }).primaryKey().notNull(),
    createdHeight: integer("created_height").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    symbol: varchar("symbol", { length: 255 }).notNull(),
    mintContract: varchar("mint_contract", { length: 255 }),
    marketContract: varchar("market_contract", { length: 255 }),
    minter: varchar("minter", { length: 255 }).notNull(),
    creator: varchar("creator", { length: 255 }).notNull(),
    description: varchar("description").notNull(),
    image: varchar("image").notNull(),
    externalLink: varchar("external_link").notNull(),
    royaltyAddress: varchar("royalty_address", { length: 255 }),
    royaltyFee: numeric("royalty_fee"),
    maxNumToken: integer("max_num_token"),
    perAddressLimit: integer("per_address_limit"),
    whitelist: uuid("whitelist").references(() => whitelist.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    startTime: timestamp("start_time", {
      withTimezone: true,
      mode: "date",
    }),
    unitPrice: numeric("unit_price"),
    unitDenom: varchar("unit_denom", { length: 255 }),
    collectorAddress: varchar("collector_address", { length: 255 }),
    tradingFeeBps: numeric("trading_fee_bps"),
    minPrice: numeric("min_price"),
  },
  (table) => {
    return {
      mint_contract: index("collection_min_contract").on(table.mintContract),
    };
  }
);

export const collectionRelations = relations(collection, ({ one, many }) => ({
  whitelist: one(whitelist, {
    fields: [collection.whitelist],
    references: [whitelist.id],
  }),
  nfts: many(nft),
  collectionBids: many(nftCollectionBid),
}));

export type Collection = typeof collection.$inferSelect;
export type CollectionInsert = typeof collection.$inferInsert;
