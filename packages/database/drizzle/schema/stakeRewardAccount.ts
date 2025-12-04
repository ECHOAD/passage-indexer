import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  bigint,
  numeric,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { stakeVault } from "./stakeVault";

export const rewardAssetTypeEnum = pgEnum("reward_asset_type", ["native", "cw20"]);

export const stakeRewardAccount = pgTable(
  "stake_reward_account",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    address: varchar("address", { length: 255 }).notNull().unique(),
    vaultAddress: varchar("vault_address", { length: 255 })
      .notNull()
      .references(() => stakeVault.address, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    rewardAssetType: rewardAssetTypeEnum("reward_asset_type").notNull(),
    rewardAssetDenom: varchar("reward_asset_denom", { length: 255 }).notNull(),
    periodStart: timestamp("period_start", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    durationSec: bigint("duration_sec", { mode: "number" }).notNull(),
    periodEnd: timestamp("period_end", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    totalFunds: numeric("total_funds", { precision: 78, scale: 0 }).notNull(),
    remainingFunds: numeric("remaining_funds", { precision: 78, scale: 0 }).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    addressIdx: index("stake_reward_account_address_idx").on(table.address),
    vaultIdx: index("stake_reward_account_vault_idx").on(table.vaultAddress),
  })
);

export const stakeRewardAccountRelations = relations(stakeRewardAccount, ({ one }) => ({
  vault: one(stakeVault, {
    fields: [stakeRewardAccount.vaultAddress],
    references: [stakeVault.address],
  }),
}));

export type StakeRewardAccount = typeof stakeRewardAccount.$inferSelect;
export type StakeRewardAccountInsert = typeof stakeRewardAccount.$inferInsert;

