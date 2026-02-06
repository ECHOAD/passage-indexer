import {
  db,
  sql,
  block as blockTable,
  transaction as transactionTable,
  message as messageTable,
  nftSale,
  nftListing,
  nftBid,
  nftAuction,
  nftMint,
  nftTransfer,
  stakingEvent,
  stakedNft,
  rewardClaim,
  eq,
  desc,
  and,
  gte,
  lte,
  count,
} from "database";
import { deleteCache, blocksDb, blockResultsDb, blockHeightToKey } from "@src/chain/dataStore";
import * as readline from "readline";

interface ReprocessOptions {
  fromBlock: number;
  toBlock: number;
  keepCache: boolean;
  dryRun: boolean;
}

interface ImpactStats {
  blocks: number;
  transactions: number;
  messages: number;
  nftSales: number;
  nftListings: number;
  nftBids: number;
  nftAuctions: number;
  nftMints: number;
  nftTransfers: number;
  stakingEvents: number;
  stakedNfts: number;
  rewardClaims: number;
}

const usage = [
  "Usage:",
  "  node dist/scripts/reprocessBlockRange.js <fromBlock> <toBlock> [options]",
  "  FROM_BLOCK=<from> TO_BLOCK=<to> node dist/scripts/reprocessBlockRange.js [options]",
  "",
  "Options:",
  "  --dry-run        Show what would be deleted without making changes",
  "  --clear-cache    Clear LevelDB cache for the range (default: keep cache)",
  "  --keep-cache     Keep LevelDB cache (default)",
  "  --help           Show this help message",
  "",
  "Examples:",
  "  node dist/scripts/reprocessBlockRange.js 1000 2000",
  "  node dist/scripts/reprocessBlockRange.js 1000 2000 --dry-run",
  "  node dist/scripts/reprocessBlockRange.js 1000 2000 --clear-cache",
].join("\n");

function parseArguments(args: string[]): ReprocessOptions | null {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }

  const dryRun = args.includes("--dry-run");
  const clearCache = args.includes("--clear-cache");
  const keepCache = !clearCache || args.includes("--keep-cache");

  // Parse from/to blocks from arguments or environment
  const numericArgs = args.filter((arg) => !arg.startsWith("--") && !isNaN(Number(arg)));

  let fromBlock: number | null = null;
  let toBlock: number | null = null;

  if (numericArgs.length >= 2) {
    fromBlock = Number(numericArgs[0]);
    toBlock = Number(numericArgs[1]);
  } else if (process.env.FROM_BLOCK && process.env.TO_BLOCK) {
    fromBlock = Number(process.env.FROM_BLOCK);
    toBlock = Number(process.env.TO_BLOCK);
  }

  if (!fromBlock || !toBlock || isNaN(fromBlock) || isNaN(toBlock)) {
    return null;
  }

  return {
    fromBlock,
    toBlock,
    keepCache,
    dryRun,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function performPreflightChecks(fromBlock: number, toBlock: number): Promise<void> {
  // 1. Validate range
  if (fromBlock > toBlock) {
    throw new Error(`fromBlock (${fromBlock}) must be <= toBlock (${toBlock})`);
  }

  if (fromBlock < 1) {
    throw new Error("fromBlock must be >= 1");
  }

  // 2. Check if blocks exist
  const firstBlockExists = await db.query.block.findFirst({
    where: eq(blockTable.height, fromBlock),
  });

  if (!firstBlockExists) {
    throw new Error(`Block ${fromBlock} does not exist in database`);
  }

  const lastBlockExists = await db.query.block.findFirst({
    where: eq(blockTable.height, toBlock),
  });

  if (!lastBlockExists) {
    throw new Error(`Block ${toBlock} does not exist in database`);
  }

  // 3. Warn if indexer appears to be running
  const latestBlock = await db.query.block.findFirst({
    orderBy: desc(blockTable.height),
  });

  if (latestBlock) {
    const timeSinceLatest = Date.now() - latestBlock.datetime.getTime();
    if (timeSinceLatest < 60000) {
      console.warn("\n⚠️  WARNING: The indexer appears to be running!");
      console.warn("   It is recommended to stop the indexer before reprocessing.");
      console.warn("   Press Ctrl+C to cancel or wait 5 seconds to continue...\n");
      await sleep(5000);
    }
  }

  // 4. Warn if range is very large
  const rangeSize = toBlock - fromBlock + 1;
  if (rangeSize > 10000) {
    console.warn(`\n⚠️  WARNING: Large block range detected (${rangeSize} blocks)`);
    console.warn("   This operation may take a long time and could timeout.");
    console.warn("   Consider processing in smaller batches.\n");
    await sleep(3000);
  }
}

async function calculateImpact(fromBlock: number, toBlock: number): Promise<ImpactStats> {
  console.log("Calculating impact...");

  const [transactionsResult] = await db
    .select({ count: count() })
    .from(transactionTable)
    .where(and(gte(transactionTable.height, fromBlock), lte(transactionTable.height, toBlock)));

  const [messagesResult] = await db
    .select({ count: count() })
    .from(messageTable)
    .where(and(gte(messageTable.height, fromBlock), lte(messageTable.height, toBlock)));

  const [nftSalesResult] = await db
    .select({ count: count() })
    .from(nftSale)
    .where(and(gte(nftSale.saleBlockHeight, fromBlock), lte(nftSale.saleBlockHeight, toBlock)));

  const [nftListingsResult] = await db
    .select({ count: count() })
    .from(nftListing)
    .where(
      sql`for_sale_block_height BETWEEN ${fromBlock} AND ${toBlock} OR unlisted_block_height BETWEEN ${fromBlock} AND ${toBlock}`
    );

  const [nftBidsResult] = await db
    .select({ count: count() })
    .from(nftBid)
    .where(
      sql`bid_block_height BETWEEN ${fromBlock} AND ${toBlock} OR removed_block_height BETWEEN ${fromBlock} AND ${toBlock}`
    );

  const [nftAuctionsResult] = await db
    .select({ count: count() })
    .from(nftAuction)
    .where(
      sql`created_block_height BETWEEN ${fromBlock} AND ${toBlock} OR closed_block_height BETWEEN ${fromBlock} AND ${toBlock} OR finalized_block_height BETWEEN ${fromBlock} AND ${toBlock} OR voided_block_height BETWEEN ${fromBlock} AND ${toBlock}`
    );

  const [nftMintsResult] = await db
    .select({ count: count() })
    .from(nftMint)
    .where(and(gte(nftMint.mintBlockHeight, fromBlock), lte(nftMint.mintBlockHeight, toBlock)));

  const [nftTransfersResult] = await db
    .select({ count: count() })
    .from(nftTransfer)
    .where(
      and(
        gte(nftTransfer.transferredOnBlockHeight, fromBlock),
        lte(nftTransfer.transferredOnBlockHeight, toBlock)
      )
    );

  const [stakingEventsResult] = await db
    .select({ count: count() })
    .from(stakingEvent)
    .where(and(gte(stakingEvent.height, fromBlock), lte(stakingEvent.height, toBlock)));

  const [stakedNftsResult] = await db
    .select({ count: count() })
    .from(stakedNft)
    .where(and(gte(stakedNft.stakedAtHeight, fromBlock), lte(stakedNft.stakedAtHeight, toBlock)));

  const [rewardClaimsResult] = await db
    .select({ count: count() })
    .from(rewardClaim)
    .where(and(gte(rewardClaim.claimedAtHeight, fromBlock), lte(rewardClaim.claimedAtHeight, toBlock)));

  return {
    blocks: toBlock - fromBlock + 1,
    transactions: transactionsResult?.count || 0,
    messages: messagesResult?.count || 0,
    nftSales: nftSalesResult?.count || 0,
    nftListings: nftListingsResult?.count || 0,
    nftBids: nftBidsResult?.count || 0,
    nftAuctions: nftAuctionsResult?.count || 0,
    nftMints: nftMintsResult?.count || 0,
    nftTransfers: nftTransfersResult?.count || 0,
    stakingEvents: stakingEventsResult?.count || 0,
    stakedNfts: stakedNftsResult?.count || 0,
    rewardClaims: rewardClaimsResult?.count || 0,
  };
}

function displayImpact(impact: ImpactStats): void {
  console.log("\n📊 Reprocessing Impact:");
  console.log(`   Blocks:            ${impact.blocks}`);
  console.log(`   Transactions:      ${impact.transactions}`);
  console.log(`   Messages:          ${impact.messages}`);
  console.log(`   NFT Sales:         ${impact.nftSales}`);
  console.log(`   NFT Listings:      ${impact.nftListings}`);
  console.log(`   NFT Bids:          ${impact.nftBids}`);
  console.log(`   NFT Auctions:      ${impact.nftAuctions}`);
  console.log(`   NFT Mints:         ${impact.nftMints}`);
  console.log(`   NFT Transfers:     ${impact.nftTransfers}`);
  console.log(`   Staking Events:    ${impact.stakingEvents}`);
  console.log(`   Staked NFTs:       ${impact.stakedNfts}`);
  console.log(`   Reward Claims:     ${impact.rewardClaims}`);
  console.log("");
}

async function promptConfirmation(fromBlock: number, toBlock: number): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `⚠️  This will delete all indexer data for blocks ${fromBlock} to ${toBlock}.\n` +
        `   Continue? (type 'yes' to confirm): `,
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "yes");
      }
    );
  });
}

async function deleteIndexerData(tx: any, fromBlock: number, toBlock: number): Promise<void> {
  // Follow the exact order from reindexFromHeight.ts but with BETWEEN instead of >=

  console.log("📝 Deleting transaction event attributes...");
  await tx.execute(sql`
    DELETE FROM "transaction_event_attribute"
    WHERE "transaction_event_id" IN (
      SELECT "id" FROM "transaction_event" WHERE "height" BETWEEN ${fromBlock} AND ${toBlock}
    )
  `);

  console.log("📝 Deleting block event attributes...");
  await tx.execute(sql`
    DELETE FROM "block_event_attribute"
    WHERE "block_event_id" IN (
      SELECT "id" FROM "block_event" WHERE "height" BETWEEN ${fromBlock} AND ${toBlock}
    )
  `);

  console.log("📝 Deleting transaction events...");
  await tx.execute(sql`
    DELETE FROM "transaction_event"
    WHERE "height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting block events...");
  await tx.execute(sql`
    DELETE FROM "block_event"
    WHERE "height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting address references...");
  await tx.execute(sql`
    DELETE FROM "address_reference"
    WHERE "transaction_id" IN (
      SELECT "id" FROM "transaction" WHERE "height" BETWEEN ${fromBlock} AND ${toBlock}
    )
  `);

  console.log("📝 Clearing NFT active listing references...");
  await tx.execute(sql`
    UPDATE "nft"
    SET "active_listing_id" = NULL
    WHERE "active_listing_id" IN (
      SELECT "id" FROM "nft_listing"
      WHERE "for_sale_block_height" BETWEEN ${fromBlock} AND ${toBlock}
         OR "unlisted_block_height" BETWEEN ${fromBlock} AND ${toBlock}
    )
  `);

  console.log("📝 Deleting NFT listings...");
  await tx.execute(sql`
    DELETE FROM "nft_listing"
    WHERE "for_sale_block_height" BETWEEN ${fromBlock} AND ${toBlock}
       OR "unlisted_block_height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting NFT bids...");
  await tx.execute(sql`
    DELETE FROM "nft_bid"
    WHERE "bid_block_height" BETWEEN ${fromBlock} AND ${toBlock}
       OR "removed_block_height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting NFT collection bids...");
  await tx.execute(sql`
    DELETE FROM "nft_collection_bid"
    WHERE "bid_block_height" BETWEEN ${fromBlock} AND ${toBlock}
       OR "removed_block_height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting NFT sales...");
  await tx.execute(sql`
    DELETE FROM "nft_sale"
    WHERE "sale_block_height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting NFT transfers...");
  await tx.execute(sql`
    DELETE FROM "nft_transfer"
    WHERE "transferred_on_block_height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting NFT mints...");
  await tx.execute(sql`
    DELETE FROM "nft_mint"
    WHERE "mint_block_height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting NFT auction bids...");
  await tx.execute(sql`
    DELETE FROM "nft_auction_bid"
    WHERE "bid_block_height" BETWEEN ${fromBlock} AND ${toBlock}
       OR "refunded_block_height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting NFT auctions...");
  await tx.execute(sql`
    DELETE FROM "nft_auction"
    WHERE "created_block_height" BETWEEN ${fromBlock} AND ${toBlock}
       OR "closed_block_height" BETWEEN ${fromBlock} AND ${toBlock}
       OR "finalized_block_height" BETWEEN ${fromBlock} AND ${toBlock}
       OR "voided_block_height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting stake reward accounts...");
  await tx.execute(sql`
    DELETE FROM "stake_reward_account"
    WHERE "address" IN (
      SELECT "reward_account_address"
      FROM "staking_event"
      WHERE "event_type" = 'create_reward_account'
        AND "height" BETWEEN ${fromBlock} AND ${toBlock}
        AND "reward_account_address" IS NOT NULL
    )
  `);

  console.log("📝 Deleting reward claims...");
  await tx.execute(sql`
    DELETE FROM "reward_claim"
    WHERE "claimed_at_height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting staking snapshots...");
  await tx.execute(sql`
    DELETE FROM "staking_snapshot"
    WHERE "height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting staking events...");
  await tx.execute(sql`
    DELETE FROM "staking_event"
    WHERE "height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting staked NFTs...");
  await tx.execute(sql`
    DELETE FROM "staked_nft"
    WHERE "staked_at_height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Resetting unstaked NFTs...");
  await tx.execute(sql`
    UPDATE "staked_nft"
    SET "unstaked_at_height" = NULL,
        "unstaked_at" = NULL,
        "claimable_at" = NULL,
        "is_claimed" = false
    WHERE "unstaked_at_height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting stake vaults...");
  await tx.execute(sql`
    DELETE FROM "stake_vault"
    WHERE "created_height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting collections...");
  await tx.execute(sql`
    DELETE FROM "collection"
    WHERE "created_height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting messages...");
  await tx.execute(sql`
    DELETE FROM "message"
    WHERE "height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Deleting transactions...");
  await tx.execute(sql`
    DELETE FROM "transaction"
    WHERE "height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  // NOTE: We do NOT delete blocks, only mark them as unprocessed
  console.log("✅ Indexer data deleted");
}

async function resetProcessingFlags(tx: any, fromBlock: number, toBlock: number): Promise<void> {
  console.log("📝 Marking blocks as unprocessed...");
  await tx.execute(sql`
    UPDATE "block"
    SET "is_processed" = false
    WHERE "height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Marking transactions as unprocessed...");
  await tx.execute(sql`
    UPDATE "transaction"
    SET "is_processed" = false
    WHERE "height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("📝 Marking messages as unprocessed...");
  await tx.execute(sql`
    UPDATE "message"
    SET "is_processed" = false
    WHERE "height" BETWEEN ${fromBlock} AND ${toBlock}
  `);

  console.log("✅ Processing flags reset");
}

async function clearCacheForRange(fromBlock: number, toBlock: number): Promise<void> {
  console.log(`📝 Clearing LevelDB cache for blocks ${fromBlock}-${toBlock}...`);

  for (let height = fromBlock; height <= toBlock; height++) {
    try {
      await blocksDb.del(blockHeightToKey(height));
      await blockResultsDb.del(blockHeightToKey(height));
    } catch (error) {
      // Ignore errors if block doesn't exist in cache
    }
  }

  console.log("✅ Cache cleared");
}

async function run() {
  const args = process.argv.slice(2);
  const options = parseArguments(args);

  if (!options) {
    console.error("Error: Invalid arguments\n");
    console.error(usage);
    process.exit(1);
  }

  const { fromBlock, toBlock, keepCache, dryRun } = options;

  console.log(`\n🔄 Reprocessing blocks ${fromBlock} to ${toBlock}\n`);

  try {
    // Pre-flight checks
    await performPreflightChecks(fromBlock, toBlock);

    // Calculate and display impact
    const impact = await calculateImpact(fromBlock, toBlock);
    displayImpact(impact);

    // If dry-run, exit after showing impact
    if (dryRun) {
      console.log("🔍 DRY RUN MODE - No changes will be made\n");
      process.exit(0);
    }

    // Confirm with user
    const confirmed = await promptConfirmation(fromBlock, toBlock);
    if (!confirmed) {
      console.log("\n❌ Operation cancelled\n");
      process.exit(0);
    }

    console.log("");

    // Execute deletion and reset within a transaction
    await db.transaction(async (tx) => {
      await deleteIndexerData(tx, fromBlock, toBlock);
      await resetProcessingFlags(tx, fromBlock, toBlock);
    });

    // Clear cache if requested
    if (!keepCache) {
      await clearCacheForRange(fromBlock, toBlock);
    }

    console.log("\n✅ Reprocessing completed successfully!");
    console.log("💡 Start the indexer to reprocess these blocks\n");
  } catch (error) {
    console.error("\n❌ Error during reprocessing:", error);
    console.error("   The transaction was rolled back. No changes were made.\n");
    process.exit(1);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to reprocess blocks:", err);
    process.exit(1);
  });
