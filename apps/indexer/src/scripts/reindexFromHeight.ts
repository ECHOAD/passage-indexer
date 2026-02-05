import { db, sql } from "database";
import { deleteCache } from "@src/chain/dataStore";

const usage = [
  "Usage:",
  "  node dist/reindexFromHeight.js <height> [--keep-cache]",
  "  START_HEIGHT=<height> node dist/reindexFromHeight.js [--keep-cache]",
].join("\n");

function parseHeight(args: string[]): number | null {
  const heightFlagIndex = args.findIndex((arg) => arg === "--height");
  if (heightFlagIndex >= 0) {
    return Number(args[heightFlagIndex + 1]);
  }

  const firstArg = args.find((arg) => !arg.startsWith("--"));
  if (firstArg) {
    return Number(firstArg);
  }

  if (process.env.START_HEIGHT) {
    return Number(process.env.START_HEIGHT);
  }

  return null;
}

async function run() {
  const args = process.argv.slice(2);
  const startHeight = parseHeight(args);
  const keepCache = args.includes("--keep-cache");

  if (!startHeight || Number.isNaN(startHeight) || startHeight < 1) {
    console.error(usage);
    process.exit(1);
  }

  console.log(`Resetting indexer data from height >= ${startHeight}...`);

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM "transaction_event_attribute"
      WHERE "transaction_event_id" IN (
        SELECT "id" FROM "transaction_event" WHERE "height" >= ${startHeight}
      )
    `);
    await tx.execute(sql`
      DELETE FROM "transaction_event"
      WHERE "height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "block_event_attribute"
      WHERE "block_event_id" IN (
        SELECT "id" FROM "block_event" WHERE "height" >= ${startHeight}
      )
    `);
    await tx.execute(sql`
      DELETE FROM "block_event"
      WHERE "height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "address_reference"
      WHERE "transaction_id" IN (
        SELECT "id" FROM "transaction" WHERE "height" >= ${startHeight}
      )
    `);

    await tx.execute(sql`
      UPDATE "nft"
      SET "active_listing_id" = NULL
      WHERE "active_listing_id" IN (
        SELECT "id" FROM "nft_listing"
        WHERE "for_sale_block_height" >= ${startHeight}
           OR "unlisted_block_height" >= ${startHeight}
      )
    `);
    await tx.execute(sql`
      DELETE FROM "nft_listing"
      WHERE "for_sale_block_height" >= ${startHeight}
         OR "unlisted_block_height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "nft_bid"
      WHERE "bid_block_height" >= ${startHeight}
         OR "removed_block_height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "nft_collection_bid"
      WHERE "bid_block_height" >= ${startHeight}
         OR "removed_block_height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "nft_sale"
      WHERE "sale_block_height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "nft_transfer"
      WHERE "transferred_on_block_height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "nft_mint"
      WHERE "mint_block_height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "nft_auction_bid"
      WHERE "bid_block_height" >= ${startHeight}
         OR "refunded_block_height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "nft_auction"
      WHERE "created_block_height" >= ${startHeight}
         OR "closed_block_height" >= ${startHeight}
         OR "finalized_block_height" >= ${startHeight}
         OR "voided_block_height" >= ${startHeight}
    `);

    await tx.execute(sql`
      DELETE FROM "stake_reward_account"
      WHERE "address" IN (
        SELECT "reward_account_address"
        FROM "staking_event"
        WHERE "event_type" = 'create_reward_account'
          AND "height" >= ${startHeight}
          AND "reward_account_address" IS NOT NULL
      )
    `);
    await tx.execute(sql`
      DELETE FROM "reward_claim"
      WHERE "claimed_at_height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "staking_snapshot"
      WHERE "height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "staking_event"
      WHERE "height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "staked_nft"
      WHERE "staked_at_height" >= ${startHeight}
    `);
    await tx.execute(sql`
      UPDATE "staked_nft"
      SET "unstaked_at_height" = NULL,
          "unstaked_at" = NULL,
          "claimable_at" = NULL,
          "is_claimed" = false
      WHERE "unstaked_at_height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "stake_vault"
      WHERE "created_height" >= ${startHeight}
    `);

    await tx.execute(sql`
      DELETE FROM "collection"
      WHERE "created_height" >= ${startHeight}
    `);

    await tx.execute(sql`
      DELETE FROM "message"
      WHERE "height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "transaction"
      WHERE "height" >= ${startHeight}
    `);
    await tx.execute(sql`
      DELETE FROM "block"
      WHERE "height" >= ${startHeight}
    `);
  });

  if (!keepCache) {
    await deleteCache();
  }

  console.log("Done. Start the indexer to rebuild from that height.");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to reset indexer data:", err);
    process.exit(1);
  });
