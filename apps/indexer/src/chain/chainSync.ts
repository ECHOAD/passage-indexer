import { statsProcessor } from "./statsProcessor";
import {
  blockHeightToKey,
  blockResultsDb,
  blocksDb,
  deleteCache,
  getCachedBlockByHeight,
  getCachedBlockResultsByHeight,
  getLatestHeightInCache
} from "./dataStore";
import { nodeAccessor } from "./nodeAccessor";
import { sha256 } from "js-sha256";
import { activeChain, executionMode, ExecutionMode, isProd, lastBlockToSync } from "@src/shared/constants";
import { differenceInSeconds } from "date-fns";
import * as benchmark from "../shared/utils/benchmark";
import * as uuid from "uuid";
import { eachLimit, asyncify } from "async";
import { env } from "@src/shared/utils/env";
import { decodeTxRaw } from "@cosmjs/proto-signing";
import { fromBase64 } from "@cosmjs/encoding";
import {
  BlockEventAttributeInsert,
  BlockEventInsert,
  BlockEventSource,
  BlockInsert,
  Day,
  MessageInsert,
  TransactionEventAttributeInsert,
  TransactionEventInsert,
  TransactionInsert,
  and,
  asc,
  block,
  blockEvent,
  blockEventAttribute,
  bulkInsert,
  day,
  db,
  desc,
  eq,
  gte,
  max,
  message,
  sql,
  transaction,
  transactionEvent,
  transactionEventAttribute
} from "database";
import { BlockType, EventType } from "@src/shared/types";

export const setMissingBlock = (height: number) => (missingBlock = height);
let missingBlock: number | null;

export async function getSyncStatus() {
  const latestHeightInCacheRequest = getLatestHeightInCache();
  const latestHeightInDbRequest = db.select({ latestHeightInDb: max(block.height) }).from(block);
  const latestProcessedHeightRequest = db
    .select({ latestProcessedHeight: max(block.height) })
    .from(block)
    .where(eq(block.isProcessed, true));
  const realLatestNotificationProcessedHeightRequest = db
    .select({ realLatestNotificationProcessedHeight: max(message.height) })
    .from(message)
    .where(eq(message.isNotificationProcessed, true));

  const [latestHeightInCache, [{ latestHeightInDb }], [{ latestProcessedHeight }], [{ realLatestNotificationProcessedHeight }]] = await Promise.all([
    latestHeightInCacheRequest,
    latestHeightInDbRequest,
    latestProcessedHeightRequest,
    realLatestNotificationProcessedHeightRequest
  ]);

  const firstNotificationUnprocessedMessage = (
    await db
      .select()
      .from(message)
      .innerJoin(transaction, eq(transaction.id, message.txId))
      .where(
        and(
          eq(message.isNotificationProcessed, false),
          gte(message.height, realLatestNotificationProcessedHeight ?? 0),
          eq(transaction.hasProcessingError, false)
        )
      )
      .orderBy(asc(message.height))
      .limit(1)
  )[0]?.message.height;

  const latestDateInDb = latestHeightInDb ? (await db.query.block.findFirst({ where: eq(block.height, latestHeightInDb) }))?.datetime : null;
  const latestProcessedDateInDb = latestProcessedHeight ? (await db.query.block.findFirst({ where: eq(block.height, latestProcessedHeight) }))?.datetime : null;
  const latestNotificationProcessedHeight = firstNotificationUnprocessedMessage ? firstNotificationUnprocessedMessage - 1 : latestHeightInDb;
  const latestNotificationProcessedDateInDb =
    !activeChain.startHeight || latestNotificationProcessedHeight! > activeChain.startHeight
      ? (await db.query.block.findFirst({ where: eq(block.height, latestNotificationProcessedHeight!) }))?.datetime
      : null;

  return {
    latestHeightInCache,
    latestHeightInDb,
    latestDateInDb,
    isInsertLate: latestDateInDb && differenceInSeconds(new Date(), latestDateInDb) > 60,
    latestProcessedHeight,
    latestProcessedDateInDb,
    isProcessingLate: latestProcessedDateInDb && differenceInSeconds(new Date(), latestProcessedDateInDb) > 60,
    latestNotificationProcessedHeight,
    latestNotificationProcessedDateInDb,
    isNotificationProcessingLate: latestNotificationProcessedDateInDb && differenceInSeconds(new Date(), latestNotificationProcessedDateInDb) > 60
  };
}

export async function syncBlocks() {
  const latestAvailableHeight = await nodeAccessor.getLatestBlockHeight();
  let latestBlockToDownload = Math.min(lastBlockToSync, latestAvailableHeight);
  const latestInsertedHeight = (await db.select({ value: max(block.height) }).from(block))[0].value || 0;
  const latestHeightInCache = await getLatestHeightInCache();

  if (latestHeightInCache >= latestBlockToDownload) {
    console.log("No blocks to download");
  } else {
    let startHeight = !env.KeepCache ? latestInsertedHeight + 1 : Math.max(latestHeightInCache, 1);

    // If database is empty
    if (latestInsertedHeight === 0) {
      console.log("Starting from scratch");
      startHeight = activeChain.startHeight || 1;
    }

    // If there was a missing block
    if (missingBlock) {
      startHeight = Math.min(missingBlock, latestBlockToDownload);
      missingBlock = null;
    }

    const maxDownloadGroupSize = 1_000;
    if (latestBlockToDownload - startHeight > maxDownloadGroupSize) {
      console.log("Limiting download to " + maxDownloadGroupSize + " blocks");
      latestBlockToDownload = startHeight + maxDownloadGroupSize;
    }

    console.log("Starting download at block #" + startHeight);
    console.log("Will end download at block #" + latestBlockToDownload);
    console.log(latestBlockToDownload - startHeight + 1 + " blocks to download");

    await benchmark.measureAsync("downloadBlocks", async () => {
      await downloadBlocks(startHeight, latestBlockToDownload);
    });
  }

  await benchmark.measureAsync("insertBlocks", async () => {
    const [{ maxHeight }] = await db.select({ maxHeight: max(block.height) }).from(block);
    const latestHeightInDb = maxHeight || activeChain.startHeight || 0;
    await insertBlocks(latestHeightInDb + 1, latestBlockToDownload); //Math.min(latestBlockToDownload, latestHeightInDb+10_000));
  });

  benchmark.displayTimes();

  await benchmark.measureAsync("processMessages", async () => {
    await statsProcessor.processMessages();
  });

  benchmark.displayTimes();

  if (!env.KeepCache) {
    await deleteCache();
  }
}

const dateCache = new Map<Date, Day>();
async function getOrCreateDay(blockDatetime: Date, height: number) {
  const blockDate = new Date(Date.UTC(blockDatetime.getUTCFullYear(), blockDatetime.getUTCMonth(), blockDatetime.getUTCDate()));
  const cachedDay = dateCache.get(blockDate);

  if (cachedDay) return cachedDay;

  const [dbDay] = await db.select().from(day).where(eq(day.date, blockDate));

  if (dbDay) {
    dateCache.set(blockDate, dbDay);
    return dbDay;
  }

  const [newDay] = await db
    .insert(day)
    .values({
      id: uuid.v4(),
      date: blockDate,
      firstBlockHeight: height,
      lastBlockHeightYet: height
    })
    .returning();
  dateCache.set(blockDate, newDay);

  return newDay;
}

type LogEntry = {
  msg_index?: number;
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
};
function normalizeLogs(raw: unknown): LogEntry[] {
  let entries: LogEntry[] = [];
  if (Array.isArray(raw)) entries = raw as LogEntry[];
  else if (typeof raw === "string") { try { entries = JSON.parse(raw); } catch {} }

  return entries.map((e, i) => ({ msg_index: e.msg_index ?? i, events: e.events ?? [] }));
}

async function insertBlocks(startHeight: number, endHeight: number) {
  const blockCount = endHeight - startHeight + 1;
  console.log("Inserting " + blockCount + " blocks into database");

  let lastInsertedBlock = await db.query.block.findFirst({ orderBy: desc(block.height) });

  let blocksToAdd: BlockInsert[] = [];
  let txsToAdd: TransactionInsert[] = [];
  let txsEventsToAdd: TransactionEventInsert[] = [];
  let txsEventAttributesToAdd: TransactionEventAttributeInsert[] = [];
  let msgsToAdd: MessageInsert[] = [];
  // let blockEventsToAdd: BlockEventInsert[] = [];
  // let blockEventAttributesToAdd: BlockEventAttributeInsert[] = [];

  for (let i = startHeight; i <= endHeight; ++i) {
    const getCachedBlockTimer = benchmark.startTimer("getCachedBlockByHeight");
    const blockData = await getCachedBlockByHeight(i);
    getCachedBlockTimer.end();

    if (!blockData) {
      missingBlock = i;
      throw "Block # " + i + " was not in cache";
    }

    let msgIndexInBlock = 0;
    const blockDatetime = new Date(blockData.block.header.time);

    const txs = blockData.block.data.txs;

    const blockResults = await getCachedBlockResultsByHeight(i);

    if (!blockResults) throw "Block results # " + i + " was not in cache";

    for (let txIndex = 0; txIndex < txs.length; ++txIndex) {
      const tx = txs[txIndex];
      const hash = sha256(Buffer.from(tx, "base64")).toUpperCase();
      const txId = uuid.v4();

      const decodedTx = decodeTxRaw(fromBase64(tx));
      const msgs = decodedTx.body.messages;

      const txJson = blockResults.txs_results[txIndex];
      const logsByMsg = !txJson.code ? normalizeLogs(txJson.log) : [];
      const eventsByMsg = new Map<number, LogEntry["events"]>();

      for (let msgIndex = 0; msgIndex < msgs.length; ++msgIndex) {
        const msg = msgs[msgIndex];

        msgsToAdd.push({
          id: uuid.v4(),
          txId: txId,
          type: msg.typeUrl,
          typeCategory: msg.typeUrl.split(".")[0].substring(1),
          index: msgIndex,
          height: i,
          indexInBlock: msgIndexInBlock++,
          data: Buffer.from(msg.value)
        });

        if(msg.typeUrl.startsWith("/cosmwasm")) {
          const eventsForMsg = eventsByMsg.get(msgIndex) ?? [];

          for (const [eventIndex, ev] of eventsForMsg.entries()) {
            const eventId = uuid.v4();
            txsEventsToAdd.push({
              id: eventId,
              height: i,
              txId,
              msgIndex,
              index: eventIndex,
              type: ev.type,
            });

            txsEventAttributesToAdd.push(
                ...ev.attributes.map((attr, attrIdx) => ({
                  transactionEventId: eventId,
                  index: attrIdx,
                  key: attr.key,
                  value: attr.value ?? null,
                })),
            );
          }
        }
      }

      txsToAdd.push({
        id: txId,
        hash: hash,
        height: i,
        msgCount: msgs.length,
        index: txIndex,
        fee: decodedTx.authInfo.fee && decodedTx.authInfo.fee.amount.length > 0 ? parseInt(decodedTx.authInfo.fee.amount[0].amount) : 0,
        memo: decodedTx.body.memo,
        hasProcessingError: !!txJson.code,
        log: !!txJson.code ? txJson.log : null,
        gasUsed: parseInt(txJson.gas_used),
        gasWanted: parseInt(txJson.gas_wanted)
      });
    }

    const blockDay = await getOrCreateDay(blockDatetime, i);
    const blockEntry = {
      height: i,
      datetime: blockDatetime,
      isProcessed: false,
      hash: blockData.block_id.hash,
      proposer: blockData.block.header.proposer_address,
      totalTxCount: (lastInsertedBlock?.totalTxCount ?? 0) + txs.length,
      dayId: blockDay.id,
      txCount: txs.length
    };

    if (lastInsertedBlock && lastInsertedBlock.dayId !== blockDay.id) {
      await db
        .update(day)
        .set({
          lastBlockHeight: lastInsertedBlock.height,
          lastBlockHeightYet: lastInsertedBlock.height
        })
        .where(eq(day.id, lastInsertedBlock.dayId));
    }

    lastInsertedBlock = blockEntry;

    blocksToAdd.push(blockEntry);

    // const { events: beginBlockEvents, attributes: beginBlockEventAttributes } = getBlockEventsAndAttributes(
    //   i,
    //   blockResults.begin_block_events || [],
    //   "begin_block_events"
    // );
    // const { events: endBlockEvents, attributes: endBlockEventAttributes } = getBlockEventsAndAttributes(
    //   i,
    //   blockResults.end_block_events || [],
    //   "end_block_events"
    // );

    // blockEventsToAdd.push(...beginBlockEvents, ...endBlockEvents);
    // blockEventAttributesToAdd.push(...beginBlockEventAttributes, ...endBlockEventAttributes);

    if (blocksToAdd.length >= 10 || i === endHeight) {
      await db.transaction(async (insertDbTransaction) => {
        await benchmark.measureAsync("createBlocks", async () => {
          await bulkInsert(insertDbTransaction, block, blocksToAdd);
        });
        // await benchmark.measureAsync("createBlockEvents", async () => {
        //     await bulkInsert(insertDbTransaction, blockEvent, blockEventsToAdd);
        // });
        // await benchmark.measureAsync("createBlockEventAttributes", async () => {
        //     await bulkInsert(insertDbTransaction, blockEventAttribute, blockEventAttributesToAdd);
        // });
        await benchmark.measureAsync("createTransactions", async () => {
          await bulkInsert(insertDbTransaction, transaction, txsToAdd);
        });
        await benchmark.measureAsync("createTransactionEvents", async () => {
          await bulkInsert(insertDbTransaction, transactionEvent, txsEventsToAdd);
        });
        await benchmark.measureAsync("createTransactionEventAttributes", async () => {
          await bulkInsert(insertDbTransaction, transactionEventAttribute, txsEventAttributesToAdd);
        });
        await benchmark.measureAsync("createMessages", async () => {
          await bulkInsert(insertDbTransaction, message, msgsToAdd);
        });

        blocksToAdd = [];
        // blockEventsToAdd = [];
        // blockEventAttributesToAdd = [];
        txsToAdd = [];
        txsEventsToAdd = [];
        txsEventAttributesToAdd = [];
        msgsToAdd = [];

        console.log(`Blocks added to db: ${i - startHeight + 1} / ${blockCount} (${(((i - startHeight + 1) * 100) / blockCount).toFixed(2)}%)`);

        if (lastInsertedBlock) {
          await insertDbTransaction
            .update(day)
            .set({
              lastBlockHeightYet: lastInsertedBlock.height
            })
            .where(eq(day.id, lastInsertedBlock.dayId));
        }
      });
    }
  }
}

// function getBlockEventsAndAttributes(height: number, events: EventType[], source: BlockEventSource) {
//   const eventsToAdd: BlockEventInsert[] = [];
//   const attributesToAdd: BlockEventAttributeInsert[] = [];

//   for (const [index, event] of events.entries()) {
//     const eventId = uuid.v4();
//     eventsToAdd.push({
//       id: eventId,
//       height: height,
//       index: index,
//       source: "begin_block_events",
//       type: event.type
//     });

//     attributesToAdd.push(
//       ...event.attributes.map((attr, i) => ({
//         blockEventId: eventId,
//         index: i,
//         key: atob(attr.key),
//         value: attr.value ? atob(attr.value) : attr.value
//       }))
//     );
//   }

//   return {
//     events: eventsToAdd,
//     attributes: attributesToAdd
//   };
// }

async function downloadBlocks(startHeight: number, endHeight: number) {
  const missingBlockCount = endHeight - startHeight + 1;

  let lastLogDate = Date.now();
  let downloadedCount = 0;
  const blockArr = Array.from(Array(missingBlockCount), (_, i) => i + startHeight);

  await eachLimit(
    blockArr,
    100,
    asyncify(async (height: number) => {
      await downloadBlock(height);

      downloadedCount++;

      if (Date.now() - lastLogDate > 500) {
        lastLogDate = Date.now();
        console.clear();
        console.log("Progress: " + ((downloadedCount * 100) / missingBlockCount).toFixed(2) + "%");

        if (!isProd) {
          nodeAccessor.displayTable();
        }
      }
    })
  );
}

async function downloadBlock(height: number) {
  let wasInCache = true;
  let blockJson = await getCachedBlockByHeight(height);

  if (!blockJson) {
    wasInCache = false;
    const responseJson = await nodeAccessor.getBlock(height);
    blockJson = responseJson.result as BlockType;
  }

  const cachedBlockResult = await getCachedBlockResultsByHeight(height);

  if (!cachedBlockResult) {
    const blockResultJson = await nodeAccessor.getBlockResult(height);
    await blockResultsDb.put(blockHeightToKey(height), JSON.stringify(blockResultJson.result));
  }

  if (!wasInCache) {
    await blocksDb.put(blockHeightToKey(height), JSON.stringify(blockJson));
  }
}
