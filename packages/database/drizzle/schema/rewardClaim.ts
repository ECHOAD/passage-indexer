import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { stakeRewardAccount } from "./stakeRewardAccount";
import { stakeVault } from "./stakeVault";
import { block } from "./block";

export const rewardClaim = pgTable(
  "reward_claim",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    rewardAccountAddress: varchar("reward_account_address", { length: 255 })
      .notNull()
      .references(() => stakeRewardAccount.address, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    vaultAddress: varchar("vault_address", { length: 255 })
      .notNull()
      .references(() => stakeVault.address, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userAddress: varchar("user_address", { length: 255 }).notNull(),
    claimedAtHeight: integer("claimed_at_height")
      .notNull()
      .references(() => block.height, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    claimedAt: timestamp("claimed_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    amount: numeric("amount", { precision: 78, scale: 0 }).notNull(),
    denom: varchar("denom", { length: 255 }).notNull(),
    stakedAmount: numeric("staked_amount", { precision: 78, scale: 0 }).notNull(),
    totalStaked: numeric("total_staked", { precision: 78, scale: 0 }).notNull(),
    rewardsPerToken: numeric("rewards_per_token", { precision: 78, scale: 18 }).notNull(), // Uint256 puede ser muy grande
  },
  (table) => ({
    userIdx: index("reward_claim_user_idx").on(table.userAddress, table.claimedAt),
    accountIdx: index("reward_claim_account_idx").on(table.rewardAccountAddress, table.claimedAt),
    vaultIdx: index("reward_claim_vault_idx").on(table.vaultAddress),
    claimedAtIdx: index("reward_claim_claimed_at_idx").on(table.claimedAt),
  })
);

export const rewardClaimRelations = relations(rewardClaim, ({ one }) => ({
  rewardAccount: one(stakeRewardAccount, {
    fields: [rewardClaim.rewardAccountAddress],
    references: [stakeRewardAccount.address],
  }),
  vault: one(stakeVault, {
    fields: [rewardClaim.vaultAddress],
    references: [stakeVault.address],
  }),
  claimedBlock: one(block, {
    fields: [rewardClaim.claimedAtHeight],
    references: [block.height],
  }),
}));

export type RewardClaim = typeof rewardClaim.$inferSelect;
export type RewardClaimInsert = typeof rewardClaim.$inferInsert;

