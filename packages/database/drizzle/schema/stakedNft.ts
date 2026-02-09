import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { stakeVault } from "./stakeVault";
import { collection } from "./collection";
import { nft } from "./nft";
import { block } from "./block";

export const stakedNft = pgTable(
  "staked_nft",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    vaultAddress: varchar("vault_address", { length: 255 })
      .notNull()
      .references(() => stakeVault.address, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    collectionAddress: varchar("collection_address", { length: 255 })
      .notNull()
      .references(() => collection.address, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    tokenId: varchar("token_id", { length: 255 }).notNull(), // String porque los contratos usan String
    stakerAddress: varchar("staker_address", { length: 255 }).notNull(),
    stakedAtHeight: integer("staked_at_height")
      .notNull()
      .references(() => block.height, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    stakedAt: timestamp("staked_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    unstakedAtHeight: integer("unstaked_at_height").references(() => block.height, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    unstakedAt: timestamp("unstaked_at", {
      withTimezone: true,
      mode: "date",
    }),
    claimableAt: timestamp("claimable_at", {
      withTimezone: true,
      mode: "date",
    }),
    isClaimed: boolean("is_claimed").default(false).notNull(),
    nftId: uuid("nft_id").references(() => nft.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => ({
    vaultCollectionTokenActiveIdx: uniqueIndex("staked_nft_vault_collection_token_active_idx")
      .on(table.vaultAddress, table.collectionAddress, table.tokenId)
      .where(sql.raw(`${table.unstakedAtHeight.name} IS NULL`)),
    vaultCollectionTokenHeightIdx: uniqueIndex("staked_nft_vault_collection_token_height_idx").on(
      table.vaultAddress,
      table.collectionAddress,
      table.tokenId,
      table.stakedAtHeight
    ),
    stakerIdx: index("staked_nft_staker_idx").on(table.stakerAddress, table.stakedAt),
    vaultIdx: index("staked_nft_vault_idx").on(table.vaultAddress, table.stakedAt),
    collectionTokenIdx: index("staked_nft_collection_token_idx").on(
      table.collectionAddress,
      table.tokenId
    ),
    unstakedIdx: index("staked_nft_unstaked_idx").on(table.unstakedAtHeight),
  })
);

export const stakedNftRelations = relations(stakedNft, ({ one }) => ({
  vault: one(stakeVault, {
    fields: [stakedNft.vaultAddress],
    references: [stakeVault.address],
  }),
  collection: one(collection, {
    fields: [stakedNft.collectionAddress],
    references: [collection.address],
  }),
  nft: one(nft, {
    fields: [stakedNft.nftId],
    references: [nft.id],
  }),
  stakedBlock: one(block, {
    fields: [stakedNft.stakedAtHeight],
    references: [block.height],
  }),
}));

export type StakedNft = typeof stakedNft.$inferSelect;
export type StakedNftInsert = typeof stakedNft.$inferInsert;

