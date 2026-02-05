import { relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  integer,
  uuid,
  numeric,
  index,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { nft } from "./nft";
import { block } from "./block";
import { transaction } from "./transaction";
import { transactionEvent } from "./transactionEvent";

export const nftSaleTypeEnum = pgEnum("nft_sale_type", [
  "fixed_price",
  "auction_english",
  "unknown",
]);

export const nftSale = pgTable(
  "nft_sale",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    previousOwner: varchar("previous_owner", { length: 255 }).notNull(),
    newOwner: varchar("new_owner", { length: 255 }).notNull(),
    nft: uuid("nft")
      .references(() => nft.id)
      .notNull(),
    salePrice: numeric("sale_price").notNull(),
    saleDenom: varchar("sale_denom", { length: 255 }).notNull(),
    saleBlockHeight: integer("sale_block_height")
      .references(() => block.height)
      .notNull(),
    sourceContract: varchar("source_contract", { length: 255 }),
    saleType: nftSaleTypeEnum("sale_type").default("unknown").notNull(),
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
    marketFee: numeric("market_fee").notNull(),
    marketFeeDenom: varchar("market_fee_denom").notNull(),
    royaltyFee: numeric("royalty_fee").notNull(),
    royaltyFeeDenom: varchar("royalty_fee_denom").notNull(),
    royaltyFeeAddress: varchar("royalty_fee_address", { length: 255 }),
  },
  (table) => ({
    nft: index("nft_sale_nft").on(table.nft),
    saleBlockHeight: index("nft_sale_block_height").on(table.saleBlockHeight),
    sourceContract: index("nft_sale_source_contract").on(table.sourceContract),
    txEventId: index("nft_sale_tx_event_id").on(table.transactionEventId),
    txEventUnique: uniqueIndex("nft_sale_tx_event_unique").on(
      table.transactionEventId
    ),
  })
);

export const nftSaleRelations = relations(nftSale, ({ one }) => ({
  nft: one(nft, {
    fields: [nftSale.nft],
    references: [nft.id],
  }),
  block: one(block, {
    fields: [nftSale.saleBlockHeight],
    references: [block.height],
  }),
  transaction: one(transaction, {
    fields: [nftSale.transactionId],
    references: [transaction.id],
  }),
  transactionEvent: one(transactionEvent, {
    fields: [nftSale.transactionEventId],
    references: [transactionEvent.id],
  }),
}));

export type NftSale = typeof nftSale.$inferSelect;
export type NftSaleInsert = typeof nftSale.$inferInsert;
