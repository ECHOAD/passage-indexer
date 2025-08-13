import { relations } from "drizzle-orm";
import { pgTable, varchar, uuid, primaryKey, index } from "drizzle-orm/pg-core";
import { nft } from "./nft";
import { collection } from "./collection";

export const nftTrait = pgTable(
  "nft_trait",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    collection: varchar("collection", { length: 255 }).references(
      () => collection.address,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      }
    ),
    displayType: varchar("display_type", { length: 255 }),
    traitType: varchar("trait_type", { length: 255 }),
    traitValue: varchar("trait_value", { length: 255 }),
  },
  (table) => ({
    collection: index("nft_trait_collection").on(table.collection),
    ctv: index("nft_trait_collection_type_value").on(table.collection, table.traitType, table.traitValue),
    tv: index("nft_trait_type_value").on(table.traitType, table.traitValue),
  })
);

export const nftToTrait = pgTable(
  "nft_to_trait",
  {
    nftId: uuid("nft_id")
      .notNull()
      .references(() => nft.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    traitId: uuid("trait_id")
      .notNull()
      .references(() => nftTrait.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.nftId, t.traitId] }),
    byNft: index("nft_to_trait_nft_id").on(t.nftId),
    byTrait: index("nft_to_trait_trait_id").on(t.traitId),
  })
);

export const nftTraitRelations = relations(nftTrait, ({ many }) => ({
  nftToTraits: many(nftToTrait),
}));

export const nftToTraitRelations = relations(nftToTrait, ({ one }) => ({
  nft: one(nft, {
    fields: [nftToTrait.nftId],
    references: [nft.id],
  }),
  trait: one(nftTrait, {
    fields: [nftToTrait.traitId],
    references: [nftTrait.id],
  }),
}));

export type NftTrait = typeof nftTrait.$inferSelect;
export type NftTraitInsert = typeof nftTrait.$inferInsert;
