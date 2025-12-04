import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  numeric,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { stakeVault } from "./stakeVault";
import { stakeRewardAccount } from "./stakeRewardAccount";
import { block } from "./block";

export const stakingSnapshotTypeEnum = pgEnum("staking_snapshot_type", [
  "global_vault",      // Snapshot global del vault (sin reward account específico)
  "global_reward",    // Snapshot global del vault + reward account
  "user",             // Snapshot por usuario específico
]);

export const stakingSnapshot = pgTable(
  "staking_snapshot",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    snapshotType: stakingSnapshotTypeEnum("snapshot_type").notNull(),
    vaultAddress: varchar("vault_address", { length: 255 })
      .notNull()
      .references(() => stakeVault.address, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    rewardAccountAddress: varchar("reward_account_address", { length: 255 }).references(
      () => stakeRewardAccount.address,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      }
    ),
    snapshotTime: timestamp("snapshot_time", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    height: integer("height")
      .notNull()
      .references(() => block.height, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    totalStaked: numeric("total_staked", { precision: 78, scale: 0 }).notNull(),
    totalStakers: integer("total_stakers").notNull(),
    totalRewardsDistributed: numeric("total_rewards_distributed", { precision: 78, scale: 0 }).notNull(),
    rewardsPerToken: numeric("rewards_per_token", { precision: 78, scale: 18 }).notNull(),
    userAddress: varchar("user_address", { length: 255 }), // Solo para snapshotType = "user"
    userStakedAmount: numeric("user_staked_amount", { precision: 78, scale: 0 }), // Solo para snapshotType = "user"
    userPendingRewards: numeric("user_pending_rewards", { precision: 78, scale: 0 }), // Solo para snapshotType = "user"
  },
  (table) => ({
    timeIdx: index("staking_snapshot_time_idx").on(table.snapshotTime),
    vaultTimeIdx: index("staking_snapshot_vault_time_idx").on(table.vaultAddress, table.snapshotTime),
    vaultUserTimeIdx: index("staking_snapshot_vault_user_time_idx").on(
      table.vaultAddress,
      table.userAddress,
      table.snapshotTime
    ),
    heightIdx: index("staking_snapshot_height_idx").on(table.height),
    typeIdx: index("staking_snapshot_type_idx").on(table.snapshotType),
    vaultTypeTimeIdx: index("staking_snapshot_vault_type_time_idx").on(
      table.vaultAddress,
      table.snapshotType,
      table.snapshotTime
    ),
  })
);

export const stakingSnapshotRelations = relations(stakingSnapshot, ({ one }) => ({
  vault: one(stakeVault, {
    fields: [stakingSnapshot.vaultAddress],
    references: [stakeVault.address],
  }),
  rewardAccount: one(stakeRewardAccount, {
    fields: [stakingSnapshot.rewardAccountAddress],
    references: [stakeRewardAccount.address],
  }),
  block: one(block, {
    fields: [stakingSnapshot.height],
    references: [block.height],
  }),
}));

export type StakingSnapshot = typeof stakingSnapshot.$inferSelect;
export type StakingSnapshotInsert = typeof stakingSnapshot.$inferInsert;

