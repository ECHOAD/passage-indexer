import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  index,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { collection } from "./collection";

export const whitelist = pgTable(
  "whitelist",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    admin: varchar("admin", { length: 255 }).notNull(),
    address: varchar("address", { length: 255 }).notNull(),
    collection: varchar("collection", { length: 255 }),
    endTime: timestamp("end_time", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    startTime: timestamp("start_time", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    memberLimit: integer("member_limit").notNull(),
    numMembers: integer("num_members").notNull(),
    perAddressLimit: integer("per_address_limit").notNull(),
    unitPrice: numeric("unit_price").notNull(),
    unitDenom: varchar("unit_denom", { length: 255 }).notNull(),
  },
  (table) => {
    return {
      collection: index("whitelist_collection").on(table.collection),
      address: uniqueIndex("whitelist_address_unique").on(table.address),
    };
  }
);

export const whitelistRelations = relations(whitelist, ({ many, one }) => ({
  collection: one(collection, {
    fields: [whitelist.collection],
    references: [collection.address],
  }),
}));

export type Whitelist = typeof whitelist.$inferSelect;
export type WhitelistInsert = typeof whitelist.$inferInsert;
