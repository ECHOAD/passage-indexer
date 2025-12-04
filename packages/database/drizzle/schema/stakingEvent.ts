import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  numeric,
  json,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { stakeVault } from "./stakeVault";
import { transaction } from "./transaction";
import { block } from "./block";
import { stakeRewardAccount } from "./stakeRewardAccount";

export const stakingEventTypeEnum = pgEnum("staking_event_type", [
  "stake",
  "unstake",
  "claim",
  "claim_rewards",
  "create_reward_account",
]);

export const stakingEvent = pgTable(
  "staking_event",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    vaultAddress: varchar("vault_address", { length: 255 })
      .notNull()
      .references(() => stakeVault.address, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    eventType: stakingEventTypeEnum("event_type").notNull(),
    userAddress: varchar("user_address", { length: 255 }).notNull(),
    height: integer("height")
      .notNull()
      .references(() => block.height, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    transactionHash: varchar("transaction_hash", { length: 255 }).notNull(),
    transactionId: uuid("transaction_id").references(() => transaction.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    blockTime: timestamp("block_time", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    nftCount: integer("nft_count"),
    rewardAccountAddress: varchar("reward_account_address", { length: 255 }).references(
      () => stakeRewardAccount.address,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      }
    ),
    rewardAmount: numeric("reward_amount", { precision: 78, scale: 0 }),
    rewardDenom: varchar("reward_denom", { length: 255 }),
    metadata: json("metadata").$type<Record<string, any>>(),
  },
  (table) => ({
    userIdx: index("staking_event_user_idx").on(table.userAddress, table.blockTime),
    vaultIdx: index("staking_event_vault_idx").on(table.vaultAddress, table.blockTime),
    heightIdx: index("staking_event_height_idx").on(table.height),
    txHashIdx: index("staking_event_tx_hash_idx").on(table.transactionHash),
    eventTypeIdx: index("staking_event_type_idx").on(table.eventType),
  })
);

export const stakingEventRelations = relations(stakingEvent, ({ one }) => ({
  vault: one(stakeVault, {
    fields: [stakingEvent.vaultAddress],
    references: [stakeVault.address],
  }),
  block: one(block, {
    fields: [stakingEvent.height],
    references: [block.height],
  }),
  transaction: one(transaction, {
    fields: [stakingEvent.transactionId],
    references: [transaction.id],
  }),
  rewardAccount: one(stakeRewardAccount, {
    fields: [stakingEvent.rewardAccountAddress],
    references: [stakeRewardAccount.address],
  }),
}));

export type StakingEvent = typeof stakingEvent.$inferSelect;
export type StakingEventInsert = typeof stakingEvent.$inferInsert;

