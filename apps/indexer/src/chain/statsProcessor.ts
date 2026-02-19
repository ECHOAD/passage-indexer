import { sha256 } from "js-sha256";
import { getCachedBlockByHeight } from "@src/chain/dataStore";
import { activeChain, lastBlockToSync } from "@src/shared/constants";
import { decodeMsg } from "@src/shared/utils/protobuf";
import { activeIndexers, indexersMsgTypes } from "@src/indexers";
import * as benchmark from "@src/shared/utils/benchmark";
import { getGenesis } from "./genesisImporter";
import { setMissingBlock } from "./chainSync";
import { decodeTxRaw } from "@cosmjs/proto-signing";
import { fromBase64 } from "@cosmjs/encoding";
import {
  and,
  block as blockTable,
  db,
  desc,
  eq,
  gte,
  lte,
  max,
  message,
  transaction as transactionTable,
  transactionEvent as transactionEventTable,
  transactionEventAttribute as transactionEventAttributeTable,
  inArray,
  asc,
  DbTransaction,
  Message,
  TransactionEventWithAttributes,
  Transaction,
  BlockEventWithAttributes
} from "database";

class StatsProcessor {
  private cacheInitialized: boolean = false;

  public async processMessages() {
    console.log("Querying unprocessed messages...");

    const shouldProcessEveryBlocks = activeIndexers.some((indexer) => indexer.runForEveryBlocks);

    const groupSize = 100;

    const previousBlockTimer = benchmark.startTimer("getPreviousProcessedBlock");
    let previousProcessedBlock = await db.query.block.findFirst({
      where: eq(blockTable.isProcessed, true),
      orderBy: [desc(blockTable.height)]
    });
    previousBlockTimer.end();

    const [{ maxDbHeight }] = await db.select({ maxDbHeight: max(blockTable.height) }).from(blockTable);

    const hasNewBlocks = !previousProcessedBlock || maxDbHeight! > previousProcessedBlock.height;

    if (!hasNewBlocks) {
      console.log("No new blocks to process");
      return;
    }

    const firstUnprocessedHeight = !previousProcessedBlock ? activeChain.startHeight || 1 : previousProcessedBlock.height + 1;

    if (!this.cacheInitialized) {
      for (const indexer of activeIndexers) {
        await indexer.initCache(firstUnprocessedHeight);
      }
      this.cacheInitialized = true;
    }

    let firstBlockToProcess = firstUnprocessedHeight;
    let lastBlockToProcess = Math.min(maxDbHeight!, firstBlockToProcess + groupSize, lastBlockToSync);
    while (firstBlockToProcess <= Math.min(maxDbHeight!, lastBlockToSync)) {
      console.log(`Loading blocks ${firstBlockToProcess} to ${lastBlockToProcess}`);

      const getBlocksTimer = benchmark.startTimer("getBlocks");
      const blocks = await db.query.block.findMany({
        with: {
          // events: {
          //   with: {
          //     attributes: true
          //   }
          // },
          transactions: {
            where: eq(transactionTable.isProcessed, false),
            orderBy: asc(transactionTable.index),
            with: {
              messages: {
                orderBy: asc(message.index),
                where: and(eq(message.isProcessed, false), inArray(message.type, indexersMsgTypes))
              },
              events: {
                orderBy: [asc(transactionEventTable.msgIndex), asc(transactionEventTable.index)],
                with: {
                  attributes: {
                    orderBy: asc(transactionEventAttributeTable.index)
                  }
                }
              }
            }
          }
        },
        where: and(eq(blockTable.isProcessed, false), gte(blockTable.height, firstBlockToProcess), lte(blockTable.height, lastBlockToProcess)),
        orderBy: asc(blockTable.height)
      });
      getBlocksTimer.end();

      await db.transaction(async (blockGroupTransaction) => {
        try {
          for (const block of blocks) {
            const getBlockByHeightTimer = benchmark.startTimer("getBlockByHeight");
            const blockData = await getCachedBlockByHeight(block.height);
            getBlockByHeightTimer.end();

            if (!blockData) {
              setMissingBlock(block.height);
              throw new Error(`Block ${block.height} not found in cache`);
            }

            for (const transaction of block.transactions) {
              const decodeTimer = benchmark.startTimer("decodeTx");
              const tx = blockData.block.data.txs.find((t) => sha256(Buffer.from(t, "base64")).toUpperCase() === transaction.hash);

              if (!tx) throw new Error(`Transaction ${transaction.hash} not found in block ${block.height}`);

              const decodedTx = decodeTxRaw(fromBase64(tx));
              decodeTimer.end();

              for (const msg of transaction.messages) {
                console.log(`Processing message ${msg.type} - Block #${block.height} - Index #${msg.index}`);
                const encodedMessage = decodedTx.body.messages[msg.index].value;

                const msgEvents = transaction.events.filter((x) => x.msgIndex === msg.index);

                await benchmark.measureAsync("processMessage", async () => {
                  await this.processMessage(msg, encodedMessage, block.height, blockGroupTransaction, transaction.hasProcessingError, msgEvents);
                });

                if (msg.amount) {
                  await benchmark.measureAsync("saveRelatedDeploymentId", async () => {
                    await blockGroupTransaction.update(message).set({ amount: msg.amount }).where(eq(message.id, msg.id));
                  });
                }
              }

              for (const indexer of activeIndexers) {
                await indexer.afterEveryTransaction(decodedTx, transaction as Transaction, blockGroupTransaction, transaction.events);
              }

              await benchmark.measureAsync("saveTransaction", async () => {
                if (transaction.multisigThreshold) {
                  await blockGroupTransaction
                    .update(transactionTable)
                    .set({ multisigThreshold: transaction.multisigThreshold })
                    .where(eq(transactionTable.id, transaction.id));
                }
              });
            }

            for (const indexer of activeIndexers) {
              await indexer.afterEveryBlock(block, previousProcessedBlock, [], blockGroupTransaction);
            }

            if (shouldProcessEveryBlocks) {
              await benchmark.measureAsync("blockUpdate", async () => {
                await blockGroupTransaction.update(blockTable).set({ isProcessed: true }).where(eq(blockTable.height, block.height));
              });
            }
            previousProcessedBlock = block;
          }

          if (!shouldProcessEveryBlocks) {
            await benchmark.measureAsync("blockUpdateIsProcessed", async () => {
              await blockGroupTransaction
                .update(blockTable)
                .set({
                  isProcessed: true
                })
                .where(and(gte(blockTable.height, firstBlockToProcess), lte(blockTable.height, lastBlockToProcess)));
            });
          }

          await benchmark.measureAsync("transactionUpdate", async () => {
            await blockGroupTransaction
              .update(transactionTable)
              .set({
                isProcessed: true
              })
              .where(and(gte(transactionTable.height, firstBlockToProcess), lte(transactionTable.height, lastBlockToProcess)));
          });

          await benchmark.measureAsync("MsgUpdate", async () => {
            await blockGroupTransaction
              .update(message)
              .set({
                isProcessed: true
              })
              .where(and(gte(message.height, firstBlockToProcess), lte(message.height, lastBlockToProcess)));
          });
        } catch (err) {
          console.error(err);
          blockGroupTransaction.rollback();
        }
      });

      firstBlockToProcess += groupSize;
      lastBlockToProcess = Math.min(maxDbHeight!, firstBlockToProcess + groupSize, lastBlockToSync);
    }
  }

  private async processMessage(
    msg: Message,
    encodedMessage: Uint8Array,
    height: number,
    blockGroupTransaction: DbTransaction,
    hasProcessingError: boolean,
    txEvents: TransactionEventWithAttributes[]
  ) {
    for (const indexer of activeIndexers) {
      if (indexer.hasHandlerForType(msg.type) && (!hasProcessingError || indexer.processFailedTxs)) {
        const decodedMessage = decodeMsg(msg.type, encodedMessage);
        await indexer.processMessage(decodedMessage, height, blockGroupTransaction, msg, txEvents);
      }
    }
  }
}

export const statsProcessor = new StatsProcessor();
