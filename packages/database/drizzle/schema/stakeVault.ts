import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  integer,
  bigint,
  timestamp,
  json,
  index,
} from "drizzle-orm/pg-core";
import { block } from "./block";

export const stakeVault = pgTable(
  "stake_vault",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    address: varchar("address", { length: 255 }).notNull().unique(),
    factoryAddress: varchar("factory_address", { length: 255 }).notNull(),
    createdHeight: integer("created_height")
      .notNull()
      .references(() => block.height, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    unstakingDurationSec: bigint("unstaking_duration_sec", { mode: "number" }).notNull(),
    collections: json("collections").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    addressIdx: index("stake_vault_address_idx").on(table.address),
    factoryIdx: index("stake_vault_factory_idx").on(table.factoryAddress),
    createdHeightIdx: index("stake_vault_created_height_idx").on(table.createdHeight),
  })
);

export const stakeVaultRelations = relations(stakeVault, ({ one, many }) => ({
  createdBlock: one(block, {
    fields: [stakeVault.createdHeight],
    references: [block.height],
  }),
}));

export type StakeVault = typeof stakeVault.$inferSelect;
export type StakeVaultInsert = typeof stakeVault.$inferInsert;

