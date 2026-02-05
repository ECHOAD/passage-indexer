import { DecodedTxRaw, parseCoins } from "@cosmjs/proto-signing";
import { Indexer } from "./indexer";
import {
  Block,
  BlockEventWithAttributes,
  DbTransaction,
  Message,
  Transaction,
  TransactionEventWithAttributes,
  and,
  collection,
  eq,
  nft,
  inArray,
  nftSale,
  nftMint,
  nftBid,
  or,
  nftTransfer,
  nftListing,
  isNotNull,
  nftCollectionBid,
  nftAuction,
  nftAuctionBid,
  Nft,
  nftTrait,
  nftToTrait,
  whitelist,
  whitelistMember,
  isNull,
} from "database";
import { MsgExecuteContract, MsgInstantiateContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import {
  CollectionMetadataTx,
  CollectionMetadataTxSchema,
  CollectionMigrationDataTx,
  CollectionMigrationDataTxSchema,
  CollectionMigrationMinterTxSchema,
  CollectionMigrationMintableTokensTxSchema,
  CollectionMigrationTx,
  CollectionMigrationTxSchema,
  CollectionMinterTx,
  CollectionMinterTxSchema,
  CollectionTx,
  CollectionTxSchema,
  CollectionUpdateStartTimeTxSchema,
  CollectionMarketplaceTxSchema,
  CollectionMarketplaceTx,
  CollectionUpdateUnitPriceTxSchema,
  CollectionUpdateConfigSchema,
  CollectionUpdateConfigTx,
  CollectionSetAdminSchema,
  CollectionWithdrawSchema,
  WhitelistInfoSchema,
  WhitelistInfoTx,
  WhitelistAddMembersSchema,
  WhitelistAddMembersTx,
  WhitelistRemoveMembersSchema,
  WhitelistUpdateStartTimeSchema,
  WhitelistUpdateEndTimeSchema,
  WhitelistUpdatePerAddressLimitSchema,
  WhitelistIncreaseMemberLimitSchema,
  CollectionSetWhitelistSchema,
  CollectionMinterTxSchema2,
  CollectionTx2
} from "@src/shared/zod/collection";
import {
  NftAcceptBidSchema,
  NftAcceptCollectionBidSchema,
  NftCollectionBidSchema,
  NftMetadataSchema,
  NftMintToSchema,
  NftMintTxSchema,
  NftRemoveAskSchema,
  NftRemoveBidSchema,
  NftRemoveCollectionBidSchema,
  NftSetAskSchema,
  NftSetBidSchema,
  NftTransferSchema
} from "@src/shared/zod/nftSchema";
import {
  AuctionInstantiateSchema,
  AuctionSetAuctionSchema,
  AuctionSetBidSchema,
  AuctionCloseSchema,
  AuctionFinalizeSchema,
  AuctionVoidSchema,
  AuctionUpdateConfigSchema,
  AuctionSetAuctionTx,
  AuctionUpdateConfigTx,
} from "@src/shared/zod/auctionSchema";
import {
  extractMinterAndCw721OnInstantiateReply,
  getEventAttributeValue,
  getEventAttributeValues,
  findEventsByType,
  parseTokenId
} from "@src/shared/utils/nftUtils";
import { ensureDenom, ensureDenoms } from "@src/shared/utils/denom";
import { activeChain } from "@src/shared/constants";
import z from "zod";

type ZodHandler<T> = { type: z.ZodType<T>; handler: (data: T) => Promise<void> | void };

function createZodHandler<T>(type: z.ZodType<T>, handler: (data: T) => Promise<void> | void): ZodHandler<T> {
  return { type, handler };
}

export class ContractIndexer extends Indexer {
  constructor() {
    super();
    this.name = "ContractIndexer";
    this.msgHandlers = {
      "/cosmwasm.wasm.v1.MsgInstantiateContract": this.handleMsgInstantiateContract,
      "/cosmwasm.wasm.v1.MsgExecuteContract": this.handleMsgContractExecute
    };
  }

  private parseNanosTimestamp(value: string): Date {
    return new Date(parseInt(value) / 1_000_000);
  }

  private async handleMsgInstantiateContract(
    decodedMessage: MsgInstantiateContract,
    height: number,
    dbTransaction: DbTransaction,
    msg: Message,
    txEvents: TransactionEventWithAttributes[]
  ) {
    const buffer = Buffer.from(decodedMessage.msg);
    const stringBuffer = buffer.toString().replace(/\\n/g, "");
    const jsonData = JSON.parse(stringBuffer);

    const handlers: ZodHandler<any>[] = [
      createZodHandler(CollectionTxSchema, (collectionTx) => this.handleCreateCollection(height, collectionTx, msg, dbTransaction, txEvents)),
      createZodHandler(CollectionMinterTxSchema, (collectionMinterTx) =>
        this.handleAssignMinterToCollection(height, collectionMinterTx, msg, dbTransaction, txEvents)
      ),
      createZodHandler(CollectionMinterTxSchema2, (collectionMinterTx) => this.handleCreateCollectionWithMinter(height, collectionMinterTx, msg,dbTransaction, txEvents)) ,
      createZodHandler(CollectionMarketplaceTxSchema, (collectionMarketplaceTx) =>
        this.insertMarketplaceData(height, dbTransaction, collectionMarketplaceTx,msg, txEvents)
      ),
      createZodHandler(AuctionInstantiateSchema, (auctionInstantiate) =>
        this.insertAuctionContractData(height, dbTransaction, auctionInstantiate, msg, txEvents)
      ),
      createZodHandler(WhitelistInfoSchema, (whitelistInfo) =>
        this.handleCreateWhitelist(height, decodedMessage.admin, decodedMessage.label, whitelistInfo, msg, dbTransaction, txEvents)
      )
    ];

    const matchingHandler = handlers.find((handler) => handler.type.safeParse(jsonData).success);

    if (matchingHandler) {
      await matchingHandler.handler(matchingHandler.type.safeParse(jsonData).data);
    } else {
      console.log("Not handled", jsonData);
    }
  }

  private async handleMsgContractExecute(
    decodedMessage: MsgExecuteContract,
    height: number,
    dbTransaction: DbTransaction,
    msg: Message,
    txEvents: TransactionEventWithAttributes[]
  ) {
    const buffer = Buffer.from(decodedMessage.msg);
    const stringBuffer = buffer.toString().replace(/\\n/g, "");
    const jsonData = JSON.parse(stringBuffer);

    const handlers: ZodHandler<any>[] = [
      createZodHandler(CollectionMetadataTxSchema, (collectionMetadata) =>
        this.insertCollectionMetadata(dbTransaction, collectionMetadata, decodedMessage.contract, height)
      ),
      createZodHandler(CollectionMigrationTxSchema, (collectionMigration) =>
        this.insertCollectionMigration(dbTransaction, collectionMigration, decodedMessage.contract, height)
      ),
      createZodHandler(CollectionMigrationDataTxSchema, (collectionMigrationData) =>
        this.insertOrUpdateCollectionMigrationData(dbTransaction, collectionMigrationData, decodedMessage.contract, height)
      ),
      createZodHandler(CollectionUpdateStartTimeTxSchema, (collectionUpdateStartTime) =>
        this.updateCollectionStartTime(dbTransaction, decodedMessage.contract, collectionUpdateStartTime.update_start_time)
      ),
      createZodHandler(CollectionUpdateUnitPriceTxSchema, (collectionUpdateUnitPrice) =>
        this.updateCollectionUnitPrice(
          dbTransaction,
          decodedMessage.contract,
          collectionUpdateUnitPrice.update_unit_price.unit_price.amount,
          collectionUpdateUnitPrice.update_unit_price.unit_price.denom
        )
      ),
      createZodHandler(CollectionUpdateConfigSchema, (collectionUpdateConfig) =>
        this.updateCollectionMarketplaceConfig(dbTransaction, decodedMessage.contract, collectionUpdateConfig)
      ),
      createZodHandler(NftMintTxSchema, () =>
        this.mintNft(dbTransaction, txEvents, height, decodedMessage.contract, decodedMessage.sender, msg.txId)
      ),
      createZodHandler(NftSetAskSchema, (nftSetAsk) =>
        this.setNftForSale(
          dbTransaction,
          txEvents,
          height,
          decodedMessage.contract,
          decodedMessage.sender,
          nftSetAsk.set_ask.token_id,
          nftSetAsk.set_ask.price.amount,
          nftSetAsk.set_ask.price.denom,
          msg.txId
        )
      ),
      createZodHandler(NftRemoveAskSchema, (nftRemoveAsk) =>
        this.removeNftSale(
          dbTransaction,
          txEvents,
          height,
          decodedMessage.contract,
          nftRemoveAsk.remove_ask.token_id,
          decodedMessage.sender,
          msg.txId
        )
      ),
      createZodHandler(NftSetBidSchema, (nftSetBid) =>
        this.setNftBid(
          dbTransaction,
          txEvents,
          height,
          nftSetBid.set_bid.token_id,
          decodedMessage.sender,
          nftSetBid.set_bid.price.amount,
          nftSetBid.set_bid.price.denom,
          decodedMessage.contract,
          msg.txId
        )
      ),
      createZodHandler(NftCollectionBidSchema, (nftSetCollectionBid) => {
        const [funds] = decodedMessage.funds;

        if (!funds) throw "No funds provided for nft collection bid";

        return this.setNftCollectionBid(
          dbTransaction,
          txEvents,
          height,
          decodedMessage.sender,
          nftSetCollectionBid.set_collection_bid.price.amount,
          nftSetCollectionBid.set_collection_bid.price.denom,
          nftSetCollectionBid.set_collection_bid.units,
          funds.amount,
          funds.denom,
          decodedMessage.contract,
          msg.txId
        );
      }),
      createZodHandler(NftRemoveBidSchema, (nftRemoveBid) =>
        this.removeNftBid(dbTransaction, txEvents, nftRemoveBid.remove_bid.token_id, decodedMessage.sender, height, decodedMessage.contract, msg.txId)
      ),
      createZodHandler(NftTransferSchema, (nftTransfer) =>
        this.transferNft(
          dbTransaction,
          txEvents,
          nftTransfer.transfer_nft.token_id,
          height,
          decodedMessage.contract,
          decodedMessage.sender,
          nftTransfer.transfer_nft.recipient,
          msg.txId
        )
      ),
      createZodHandler(NftRemoveCollectionBidSchema, (nftRemoveCollectionBid) =>
        this.removeNftCollectionBid(dbTransaction, txEvents, decodedMessage.sender, height, decodedMessage.contract, msg.txId)
      ),
      createZodHandler(NftAcceptCollectionBidSchema, (nftAcceptCollectionBid) =>
        this.acceptCollectionBid(
          dbTransaction,
          txEvents,
          parseTokenId(nftAcceptCollectionBid.accept_collection_bid.token_id),
          nftAcceptCollectionBid.accept_collection_bid.bidder,
          height,
          decodedMessage.contract,
          msg.txId
        )
      ),
      createZodHandler(NftAcceptBidSchema, (nftAcceptBid) =>
        this.acceptBid(
          dbTransaction,
          txEvents,
          parseTokenId(nftAcceptBid.accept_bid.token_id),
          nftAcceptBid.accept_bid.bidder,
          height,
          decodedMessage.contract,
          msg.txId
        )
      ),
      createZodHandler(NftMintToSchema, (nftMintTo) =>
        this.mintToNft(dbTransaction, txEvents, decodedMessage.contract, nftMintTo.mint_to.recipient, height, decodedMessage.sender, msg.txId)
      ),
      createZodHandler(AuctionSetAuctionSchema, (setAuction) =>
        this.setAuction(dbTransaction, txEvents, height, decodedMessage.contract, decodedMessage.sender, setAuction, msg.txId)
      ),
      createZodHandler(AuctionUpdateConfigSchema, (updateConfig) =>
        this.updateCollectionAuctionConfig(dbTransaction, decodedMessage.contract, updateConfig)
      ),
      createZodHandler(AuctionSetBidSchema, (setBid) =>
        this.setAuctionBid(dbTransaction, txEvents, height, decodedMessage.contract, decodedMessage.sender, setBid, msg.txId)
      ),
      createZodHandler(AuctionCloseSchema, (closeAuction) =>
        this.closeAuction(dbTransaction, txEvents, height, decodedMessage.contract, decodedMessage.sender, closeAuction, msg.txId)
      ),
      createZodHandler(AuctionFinalizeSchema, (finalizeAuction) =>
        this.finalizeAuction(dbTransaction, txEvents, height, decodedMessage.contract, decodedMessage.sender, finalizeAuction, msg.txId)
      ),
      createZodHandler(AuctionVoidSchema, (voidAuction) =>
        this.voidAuction(dbTransaction, txEvents, height, decodedMessage.contract, decodedMessage.sender, voidAuction, msg.txId)
      ),
      /* Untracked transactions for now */
      createZodHandler(CollectionMigrationMinterTxSchema, (collectionMigrationMinter) => console.log("Ignored Type: CollectionMigrationMinterTxSchema")),
      createZodHandler(CollectionMigrationMintableTokensTxSchema, (collectionMigrationMintableTokens) =>
        console.log("Ignored Type: CollectionMigrationMintableTokensTxSchema")
      ),
      createZodHandler(CollectionSetAdminSchema, (collectionSetAdmin) => console.log("Ignored Type: CollectionSetAdminSchema")),
      createZodHandler(CollectionWithdrawSchema, (collectionWithdraw) => console.log("Ignored Type: CollectionWithdrawSchema")),
      createZodHandler(CollectionSetWhitelistSchema, (collectionSetWhitelist) =>
        this.updateCollectionWhitelist(dbTransaction, decodedMessage.contract, collectionSetWhitelist.set_whitelist.whitelist)
      ),
      createZodHandler(WhitelistAddMembersSchema, (whitelistAddMembers) =>
        this.handleAddWhitelistMembers(dbTransaction, decodedMessage.contract, whitelistAddMembers, height)
      ),
      createZodHandler(WhitelistRemoveMembersSchema, (whitelistRemoveMembers) =>
        this.handleRemoveWhitelistMembers(dbTransaction, decodedMessage.contract, whitelistRemoveMembers, height)
      ),
      createZodHandler(WhitelistUpdateStartTimeSchema, (updateStart) =>
        this.updateWhitelistStartTime(dbTransaction, decodedMessage.contract, updateStart.update_start_time)
      ),
      createZodHandler(WhitelistUpdateEndTimeSchema, (updateEnd) =>
        this.updateWhitelistEndTime(dbTransaction, decodedMessage.contract, updateEnd.update_end_time)
      ),
      createZodHandler(WhitelistUpdatePerAddressLimitSchema, (updateLimit) =>
        this.updateWhitelistPerAddressLimit(dbTransaction, decodedMessage.contract, updateLimit.update_per_address_limit)
      ),
      createZodHandler(WhitelistIncreaseMemberLimitSchema, (increaseLimit) =>
        this.updateWhitelistMemberLimit(dbTransaction, decodedMessage.contract, increaseLimit.increase_member_limit)
      )
    ];

    const matchingHandler = handlers.find((handler) => handler.type.safeParse(jsonData).success);

    if (matchingHandler) {
      await matchingHandler.handler(matchingHandler.type.safeParse(jsonData).data);
    } else if (!jsonData.approve && !jsonData.migration_done) {
      console.log("Not handled", jsonData);
    }
  }

  private async handleCreateCollection(height: number, collectionTx: CollectionTx, msg: Message, dbTransaction: DbTransaction, txEvents: TransactionEventWithAttributes[]) {
    const collectionAddress = getEventAttributeValue(txEvents, "instantiate", "_contract_address");

    if (!collectionAddress) throw new Error(`Collection address not found for ${collectionTx.name}`);

    await dbTransaction.insert(collection).values({
      address: collectionAddress,
      createdHeight: height,
      name: collectionTx.name,
      symbol: collectionTx.symbol,
      minter: collectionTx.minter,
      creator: collectionTx.collection_info.creator,
      description: collectionTx.collection_info.description,
      image: collectionTx.collection_info.image,
      externalLink: collectionTx.collection_info.external_link,
      royaltyAddress: collectionTx.collection_info.royalty_info?.payment_address,
      royaltyFee: collectionTx.collection_info.royalty_info?.share
    });
  }


  private async handleCreateCollectionWithMinter(height: number, collectionTx: CollectionTx2, msg: Message, dbTransaction: DbTransaction, txEvents: TransactionEventWithAttributes[]) {

    const { minter: minterContract, cw721: collectionAddress } = extractMinterAndCw721OnInstantiateReply(txEvents)


    if (!collectionAddress || !minterContract) throw new Error(`Collection | Minter address not found for ${collectionTx.cw721_instantiate_msg.name}`);

    await ensureDenom(dbTransaction, collectionTx.unit_price.denom);

    const whitelistDb = await dbTransaction.query.whitelist.findFirst({
      where: (whitelist, { eq }) => eq(whitelist.address, (collectionTx.whitelist ?? ''))
    })

    await dbTransaction.insert(collection).values({
      address: collectionAddress,
      createdHeight: height,
      name: collectionTx.cw721_instantiate_msg.name,
      symbol: collectionTx.cw721_instantiate_msg.symbol,
      minter: collectionTx.cw721_instantiate_msg.minter,
      mintContract: minterContract,
      creator: collectionTx.cw721_instantiate_msg.collection_info.creator,
      description: collectionTx.cw721_instantiate_msg.collection_info.description,
      image: collectionTx.cw721_instantiate_msg.collection_info.image,
      externalLink: collectionTx.cw721_instantiate_msg.collection_info.external_link,
      royaltyAddress: collectionTx.cw721_instantiate_msg.collection_info.royalty_info?.payment_address,
      royaltyFee: collectionTx.cw721_instantiate_msg.collection_info.royalty_info?.share,
      unitDenom: collectionTx.unit_price.denom,
      unitPrice: collectionTx.unit_price.amount,
      startTime: new Date(parseInt(collectionTx.start_time) / 1_000_000),
      maxNumToken: collectionTx.max_num_tokens,
      perAddressLimit: collectionTx.per_address_limit,
      whitelist: whitelistDb ? whitelistDb.id : null
    });
  }


  private async handleAssignMinterToCollection(
    height: number,
    collectionMinterTx: CollectionMinterTx,
    msg: Message,
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[]
  ) {
    const minterAddress = getEventAttributeValue(txEvents, "instantiate", "_contract_address");

    if (!minterAddress) throw new Error(`Collection address not found for ${collectionMinterTx.cw721_address} (#${height})`);

    const startTime = new Date(parseInt(collectionMinterTx.start_time) / 1_000_000);

    await ensureDenom(dbTransaction, collectionMinterTx.unit_price.denom);

    await dbTransaction
      .update(collection)
      .set({
        mintContract: minterAddress,
        maxNumToken: collectionMinterTx.max_num_tokens,
        perAddressLimit: collectionMinterTx.per_address_limit,
        startTime: startTime,
        unitPrice: collectionMinterTx.unit_price.amount,
        unitDenom: collectionMinterTx.unit_price.denom
      })
      .where(eq(collection.address, collectionMinterTx.cw721_address));
  }

  private async insertMarketplaceData(
    height: number,
    dbTransaction: DbTransaction,
    collectionMarketplaceTx: CollectionMarketplaceTx,
    msg: Message,
    txEvents: TransactionEventWithAttributes[]
  ) {
    const marketContractAddress = getEventAttributeValue(txEvents, "instantiate", "_contract_address");

    if (!marketContractAddress) throw new Error(`Marketplace contract address not found for ${collectionMarketplaceTx.cw721_address} (height: #${height})`);

    await ensureDenom(dbTransaction, collectionMarketplaceTx.denom);

    await dbTransaction
      .update(collection)
      .set({
        collectorAddress: collectionMarketplaceTx.collector_address,
        marketContract: marketContractAddress,
        marketDenom: collectionMarketplaceTx.denom,
        tradingFeeBps: collectionMarketplaceTx.trading_fee_bps?.toString(),
        minPrice: collectionMarketplaceTx.min_price
      })
      .where(eq(collection.address, collectionMarketplaceTx.cw721_address));
  }

  private async insertAuctionContractData(
    height: number,
    dbTransaction: DbTransaction,
    auctionInstantiate: any,
    msg: Message,
    txEvents: TransactionEventWithAttributes[]
  ) {
    const auctionContractAddress = getEventAttributeValue(txEvents, "instantiate", "_contract_address");

    if (!auctionContractAddress) throw new Error(`Auction contract address not found (height: #${height})`);

    await ensureDenom(dbTransaction, auctionInstantiate.denom);

    await dbTransaction
      .update(collection)
      .set({
        auctionContract: auctionContractAddress,
        auctionDenom: auctionInstantiate.denom,
        auctionCollectorAddress: auctionInstantiate.collector_address,
        auctionTradingFeeBps: auctionInstantiate.trading_fee_bps?.toString(),
        auctionMinPrice: auctionInstantiate.min_price,
        auctionMinBidIncrement: auctionInstantiate.min_bid_increment,
        auctionMinDuration: auctionInstantiate.min_duration,
        auctionMaxDuration: auctionInstantiate.max_duration,
        auctionClosedDuration: auctionInstantiate.closed_duration,
        auctionBufferDuration: auctionInstantiate.buffer_duration
      })
      .where(eq(collection.address, auctionInstantiate.cw721_address));
  }

  private async setAuction(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    height: number,
    auctionContractAddress: string,
    seller: string,
    setAuction: AuctionSetAuctionTx,
    txId?: string
  ) {
    const data = setAuction.set_auction;
    const auctionEvent = findEventsByType(txEvents, "set-auction")[0];
    const collectionAddress =
      getEventAttributeValue(txEvents, "set-auction", "collection") ||
      getEventAttributeValue(txEvents, "wasm", "collection");
    const tokenIdRaw = data.token_id;
    const tokenId = parseTokenId(tokenIdRaw);
    const numericTokenId = Number.isNaN(tokenId) ? null : tokenId;

    const dbCollection =
      (collectionAddress
        ? await dbTransaction.query.collection.findFirst({
            where: (collection, { eq }) => eq(collection.address, collectionAddress)
          })
        : null) ||
      (await dbTransaction.query.collection.findFirst({
        where: (collection, { eq }) => eq(collection.auctionContract, auctionContractAddress)
      }));

    if (!dbCollection) {
      throw new Error(`Collection not found for auction contract ${auctionContractAddress}`);
    }

    const dbNft = numericTokenId === null
      ? null
      : await dbTransaction.query.nft.findFirst({
          where: (nft, { and, eq }) => and(eq(nft.collection, dbCollection.address), eq(nft.tokenId, numericTokenId))
        });

    const startTime = this.parseNanosTimestamp(data.start_time);
    const endTime = this.parseNanosTimestamp(data.end_time);

    await ensureDenoms(dbTransaction, [
      data.starting_price?.denom,
      data.reserve_price?.denom ?? null
    ]);

    await dbTransaction
      .insert(nftAuction)
      .values({
        auctionContract: auctionContractAddress,
        collection: dbCollection.address,
        nftId: dbNft?.id ?? null,
        tokenId: numericTokenId,
        rawTokenId: tokenIdRaw,
        seller: seller,
        startTime,
        endTime,
        startingPrice: data.starting_price.amount,
        startingDenom: data.starting_price.denom,
        reservePrice: data.reserve_price?.amount ?? null,
        reserveDenom: data.reserve_price?.denom ?? null,
        status: "active",
        createdBlockHeight: height,
        transactionId: txId ?? null,
        transactionEventId: auctionEvent?.id ?? null
      })
      .onConflictDoNothing();

    if (dbNft) {
      await dbTransaction
        .update(nft)
        .set({
          owner: auctionContractAddress,
          activeListingId: null
        })
        .where(eq(nft.id, dbNft.id));
    }
  }

  private async setAuctionBid(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    height: number,
    auctionContractAddress: string,
    bidder: string,
    setBid: any,
    txId?: string
  ) {
    const data = setBid.set_auction_bid;
    const tokenIdRaw = data.token_id;
    const tokenId = parseTokenId(tokenIdRaw);
    const bidEvent = findEventsByType(txEvents, "set-auction-bid")[0];

    await ensureDenom(dbTransaction, data.price?.denom);

    const dbAuction = await dbTransaction.query.nftAuction.findFirst({
      where: (auction, { and, eq }) =>
        and(
          eq(auction.auctionContract, auctionContractAddress),
          eq(auction.rawTokenId, tokenIdRaw),
          eq(auction.status, "active")
        )
    });

    if (!dbAuction) {
      throw new Error(`Auction not found for token ${tokenIdRaw} in ${auctionContractAddress}`);
    }

    const prevHighest = await dbTransaction.query.nftAuctionBid.findFirst({
      where: (auctionBid, { and, eq }) =>
        and(eq(auctionBid.auctionId, dbAuction.id), eq(auctionBid.isHighest, true))
    });

    if (prevHighest) {
      await dbTransaction
        .update(nftAuctionBid)
        .set({ refundedBlockHeight: height, isHighest: false })
        .where(eq(nftAuctionBid.id, prevHighest.id));
    }

    await dbTransaction
      .insert(nftAuctionBid)
      .values({
        auctionId: dbAuction.id,
        bidder,
        bidPrice: data.price.amount,
        bidDenom: data.price.denom,
        bidBlockHeight: height,
        isHighest: true,
        transactionEventId: bidEvent?.id ?? null
      })
      .onConflictDoNothing();

    let nextEndTime = dbAuction.endTime;
    const blockRow = await dbTransaction.query.block.findFirst({
      where: (block, { eq }) => eq(block.height, height)
    });

    if (blockRow && dbAuction.endTime) {
      const dbCollection = await dbTransaction.query.collection.findFirst({
        where: (collection, { eq }) => eq(collection.address, dbAuction.collection)
      });
      const bufferSec = Number(dbCollection?.auctionBufferDuration ?? 0);
      if (bufferSec > 0) {
        const candidate = new Date(blockRow.datetime.getTime() + bufferSec * 1000);
        if (candidate > dbAuction.endTime) {
          nextEndTime = candidate;
        }
      }
    }

    await dbTransaction
      .update(nftAuction)
      .set({
        highestBidPrice: data.price.amount,
        highestBidDenom: data.price.denom,
        highestBidder: bidder,
        highestBidBlockHeight: height,
        endTime: nextEndTime
      })
      .where(eq(nftAuction.id, dbAuction.id));
  }

  private async closeAuction(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    height: number,
    auctionContractAddress: string,
    sender: string,
    closeAuction: any,
    txId?: string
  ) {
    const data = closeAuction.close_auction;
    const tokenIdRaw = data.token_id;
    const dbAuction = await dbTransaction.query.nftAuction.findFirst({
      where: (auction, { and, eq }) =>
        and(eq(auction.auctionContract, auctionContractAddress), eq(auction.rawTokenId, tokenIdRaw))
    });

    if (!dbAuction) return;

    const closeEvent = findEventsByType(txEvents, "close-auction")[0];
    const isSaleAttr = getEventAttributeValue(txEvents, "close-auction", "is_sale");
    const isSale = isSaleAttr ? isSaleAttr === "true" : data.accept_highest_bid;

    if (isSale) {
      await this.executeNftSale(dbTransaction, txEvents, parseTokenId(tokenIdRaw), height, auctionContractAddress, "auction_english", txId);
    } else {
      if (dbAuction.nftId) {
        await dbTransaction
          .update(nft)
          .set({ owner: dbAuction.seller })
          .where(eq(nft.id, dbAuction.nftId));
      }

      const highestBid = await dbTransaction.query.nftAuctionBid.findFirst({
        where: (auctionBid, { and, eq }) =>
          and(eq(auctionBid.auctionId, dbAuction.id), eq(auctionBid.isHighest, true))
      });
      if (highestBid) {
        await dbTransaction
          .update(nftAuctionBid)
          .set({ refundedBlockHeight: height, isHighest: false })
          .where(eq(nftAuctionBid.id, highestBid.id));
      }
    }

    await dbTransaction
      .update(nftAuction)
      .set({
        status: isSale ? "finalized" : "closed",
        closedBlockHeight: height,
        transactionEventId: closeEvent?.id ?? dbAuction.transactionEventId
      })
      .where(eq(nftAuction.id, dbAuction.id));
  }

  private async finalizeAuction(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    height: number,
    auctionContractAddress: string,
    sender: string,
    finalizeAuction: any,
    txId?: string
  ) {
    const tokenIdRaw = finalizeAuction.finalize_auction.token_id;
    const dbAuction = await dbTransaction.query.nftAuction.findFirst({
      where: (auction, { and, eq }) =>
        and(eq(auction.auctionContract, auctionContractAddress), eq(auction.rawTokenId, tokenIdRaw))
    });

    if (!dbAuction) return;

    await this.executeNftSale(dbTransaction, txEvents, parseTokenId(tokenIdRaw), height, auctionContractAddress, "auction_english", txId);

    await dbTransaction
      .update(nftAuction)
      .set({
        status: "finalized",
        finalizedBlockHeight: height
      })
      .where(eq(nftAuction.id, dbAuction.id));
  }

  private async voidAuction(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    height: number,
    auctionContractAddress: string,
    sender: string,
    voidAuction: any,
    txId?: string
  ) {
    const tokenIdRaw = voidAuction.void_auction.token_id;
    const dbAuction = await dbTransaction.query.nftAuction.findFirst({
      where: (auction, { and, eq }) =>
        and(eq(auction.auctionContract, auctionContractAddress), eq(auction.rawTokenId, tokenIdRaw))
    });

    if (!dbAuction) return;

    if (dbAuction.nftId) {
      await dbTransaction
        .update(nft)
        .set({ owner: dbAuction.seller })
        .where(eq(nft.id, dbAuction.nftId));
    }

    const highestBid = await dbTransaction.query.nftAuctionBid.findFirst({
      where: (auctionBid, { and, eq }) =>
        and(eq(auctionBid.auctionId, dbAuction.id), eq(auctionBid.isHighest, true))
    });
    if (highestBid) {
      await dbTransaction
        .update(nftAuctionBid)
        .set({ refundedBlockHeight: height, isHighest: false })
        .where(eq(nftAuctionBid.id, highestBid.id));
    }

    await dbTransaction
      .update(nftAuction)
      .set({
        status: "voided",
        voidedBlockHeight: height
      })
      .where(eq(nftAuction.id, dbAuction.id));
  }

  private async updateCollectionStartTime(dbTransaction: DbTransaction, contractAddress: string, newStartTime: string) {
    const startTime = new Date(parseInt(newStartTime) / 1_000_000);
    await dbTransaction
      .update(collection)
      .set({
        startTime: startTime
      })
      .where(or(eq(collection.address, contractAddress), eq(collection.mintContract, contractAddress)));
  }

  private async updateCollectionUnitPrice(dbTransaction: DbTransaction, contractAddress: string, amount: string, denom: string) {
    await ensureDenom(dbTransaction, denom);
    await dbTransaction
      .update(collection)
      .set({
        unitPrice: amount,
        unitDenom: denom
      })
      .where(or(eq(collection.address, contractAddress), eq(collection.mintContract, contractAddress)));
  }

  private async updateCollectionMarketplaceConfig(
    dbTransaction: DbTransaction,
    marketContractAddress: string,
    collectionUpdateConfig: CollectionUpdateConfigTx
  ) {
    const dbCollection = await dbTransaction.query.collection.findFirst({
      where: (collection, { eq }) => eq(collection.marketContract, marketContractAddress)
    });

    if (!dbCollection) {
      throw new Error(`Collection not found for market contract ${marketContractAddress}`);
    }

    const tradingFeeBps = collectionUpdateConfig.update_config.trading_fee_bps
      ? collectionUpdateConfig.update_config.trading_fee_bps
      : collectionUpdateConfig.update_config.trading_fee_percent
        ? parseInt(collectionUpdateConfig.update_config.trading_fee_percent) * 100
        : dbCollection.tradingFeeBps;
    const collectorAddress = collectionUpdateConfig.update_config.collector_address || dbCollection.collectorAddress;
    const minPrice = collectionUpdateConfig.update_config.min_price || dbCollection.minPrice;

    await dbTransaction
      .update(collection)
      .set({
        tradingFeeBps: tradingFeeBps?.toString(),
        collectorAddress: collectorAddress,
        minPrice: minPrice
      })
      .where(eq(collection.address, dbCollection.address));
  }

  private async updateCollectionAuctionConfig(
    dbTransaction: DbTransaction,
    auctionContractAddress: string,
    auctionUpdateConfig: AuctionUpdateConfigTx
  ) {
    const dbCollection = await dbTransaction.query.collection.findFirst({
      where: (collection, { eq }) => eq(collection.auctionContract, auctionContractAddress)
    });

    if (!dbCollection) {
      throw new Error(`Collection not found for auction contract ${auctionContractAddress}`);
    }

    const config = auctionUpdateConfig.update_config;

    await dbTransaction
      .update(collection)
      .set({
        auctionCollectorAddress: config.collector_address ?? dbCollection.auctionCollectorAddress,
        auctionTradingFeeBps: config.trading_fee_bps !== undefined ? config.trading_fee_bps.toString() : dbCollection.auctionTradingFeeBps,
        auctionMinPrice: config.min_price ?? dbCollection.auctionMinPrice,
        auctionMinBidIncrement: config.min_bid_increment ?? dbCollection.auctionMinBidIncrement,
        auctionMinDuration: config.min_duration ?? dbCollection.auctionMinDuration,
        auctionMaxDuration: config.max_duration ?? dbCollection.auctionMaxDuration,
        auctionClosedDuration: config.closed_duration ?? dbCollection.auctionClosedDuration,
        auctionBufferDuration: config.buffer_duration ?? dbCollection.auctionBufferDuration
      })
      .where(eq(collection.address, dbCollection.address));
  }

  private async insertCollectionMigration(
    dbTransaction: DbTransaction,
    collectionMigration: CollectionMigrationTx,
    collectionContract: string,
    height: number
  ) {
    const dbCollection = await dbTransaction.query.collection.findFirst({
      where: (collection, { eq }) => eq(collection.address, collectionContract)
    });

    if (!dbCollection) {
      throw new Error(`Collection not found for mint contract ${collectionContract}`);
    }

    for (const token_migration of collectionMigration.migrate.migrations) {
      const dbNft = await dbTransaction
        .insert(nft)
        .values({
          tokenId: parseTokenId(token_migration.token_id),
          owner: token_migration.owner,
          migratedOnBlockHeight: height,
          metadata: token_migration.extension ?? {},
          collection: dbCollection.address,
          createdOnBlockHeight: height
        })
        .returning();

      await this.insertNftTraits(dbTransaction, dbNft[0], height, token_migration.extension ?? {});
    }
  }

  private async insertOrUpdateCollectionMigrationData(
    dbTransaction: DbTransaction,
    collectionMigrationData: CollectionMigrationDataTx,
    collectionContract: string,
    height: number
  ) {
    const dbCollection = await dbTransaction.query.collection.findFirst({
      where: (collection, { eq, or }) => or(eq(collection.address, collectionContract), eq(collection.mintContract, collectionContract))
    });

    if (!dbCollection) {
      throw new Error(`Collection not found for mint contract ${collectionContract}`);
    }

    for (const token_migration of collectionMigrationData.migrate_data.migrations.tokens) {
      const dbNft = await dbTransaction
        .insert(nft)
        .values({
          tokenId: token_migration.token_id,
          metadata: token_migration.metadata ?? {},
          collection: dbCollection.address,
          createdOnBlockHeight: height,
          mintedOnBlockHeight: token_migration.is_minted ? height : null
        })
        .onConflictDoUpdate({
          target: [nft.collection, nft.tokenId],
          set: {
            metadata: token_migration.metadata ?? {}
          }
        })
        .returning();

      await this.insertNftTraits(dbTransaction, dbNft[0], height, token_migration.metadata ?? {});
    }
  }

  private async insertCollectionMetadata(dbTransaction: DbTransaction, collectionMetadata: CollectionMetadataTx, contractAddress: string, height: number) {
    const dbCollection = await dbTransaction.query.collection.findFirst({
      where: (collection, { eq }) => or(eq(collection.mintContract, contractAddress), eq(collection.address, contractAddress))
    });

    if (!dbCollection) {
      throw new Error(`Collection not found for mint contract ${contractAddress}`);
    }

    for (const token_metadata of collectionMetadata.upsert_token_metadatas.token_metadatas) {
      const dbNft = await dbTransaction
        .insert(nft)
        .values({
          tokenId: token_metadata.token_id,
          metadata: token_metadata.metadata ?? {},
          collection: dbCollection.address,
          createdOnBlockHeight: height
        })
        .onConflictDoUpdate({
          target: [nft.collection, nft.tokenId],
          set: {
            metadata: token_metadata.metadata ?? {}
          }
        })
        .returning();

      await this.insertNftTraits(dbTransaction, dbNft[0], height, token_metadata.metadata ?? {});
    }
  }

  private async mintNft(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    height: number,
    contractAddress: string,
    minter: string,
    txId?: string
  ) {
    const tokenId = getEventAttributeValue(txEvents, "wasm", "token_id");
    const normalizedTokenId = tokenId && parseTokenId(tokenId);
    const mintPrice = getEventAttributeValue(txEvents, "wasm", "mint_price");
    const recipient =
      getEventAttributeValue(txEvents, "wasm", "recipient") ||
      getEventAttributeValue(txEvents, "coin_spent", "spender") ||
      minter;

    const dbCollection = await dbTransaction.query.collection.findFirst({
      where: (collection, { or, eq }) => or(eq(collection.address, contractAddress), eq(collection.mintContract, contractAddress))
    });

    if (!dbCollection) {
      throw new Error(`Collection not found for mint contract ${contractAddress}`);
    }

    if (!normalizedTokenId) {
      throw new Error(`Token id not found for collection ${dbCollection.address}`);
    }

    const mintEvent = findEventsByType(txEvents, "wasm")[0];
    const mintDenom = dbCollection.unitDenom || activeChain.udenom;

    await ensureDenom(dbTransaction, mintDenom);

    const [updated] = await dbTransaction
      .update(nft)
      .set({
        mintedOnBlockHeight: height,
        mintPrice: mintPrice ?? "0",
        mintDenom: mintDenom,
        owner: recipient
      })
      .where(and(eq(nft.tokenId, normalizedTokenId), eq(nft.collection, dbCollection.address)))
      .returning();

    const dbNft =
      updated ||
      (
        await dbTransaction
          .insert(nft)
          .values({
            tokenId: normalizedTokenId,
            metadata: {},
            collection: dbCollection.address,
            createdOnBlockHeight: height,
            mintedOnBlockHeight: height,
            mintPrice: mintPrice ?? "0",
            mintDenom: mintDenom,
            owner: recipient
          })
          .onConflictDoNothing()
          .returning()
      )[0];

    if (dbNft) {
      await dbTransaction
        .insert(nftMint)
        .values({
          nftId: dbNft.id,
          minter,
          recipient,
          mintPrice: mintPrice ?? "0",
          mintDenom: mintDenom,
          mintBlockHeight: height,
          isAirdrop: false,
          transactionId: txId ?? null,
          transactionEventId: mintEvent?.id ?? null
        })
        .onConflictDoNothing();
    }
  }

  private async mintToNft(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    contractAddress: string,
    recipient: string,
    height: number,
    minter: string,
    txId?: string
  ) {
    const tokenId = getEventAttributeValue(txEvents, "wasm", "token_id");
    const mintPrice = getEventAttributeValue(txEvents, "wasm", "mint_price");
    const normalizedTokenId = tokenId && parseTokenId(tokenId);

    const dbCollection = await dbTransaction.query.collection.findFirst({
      where: (collection, { or, eq }) => or(eq(collection.address, contractAddress), eq(collection.mintContract, contractAddress))
    });

    if (!dbCollection) {
      throw new Error(`Collection not found for mint contract ${contractAddress}`);
    }

    if (!normalizedTokenId) {
      throw new Error(`Token id not found for collection ${dbCollection.address}`);
    }

    if (!mintPrice) {
      throw new Error(`Mint price not found for token ${normalizedTokenId}`);
    }

    if (!recipient) {
      throw new Error(`Owner not found for token ${normalizedTokenId}`);
    }

    const mintEvent = findEventsByType(txEvents, "wasm")[0];
    const mintDenom = dbCollection.unitDenom || activeChain.udenom;

    await ensureDenom(dbTransaction, mintDenom);

    const [updated] = await dbTransaction
      .update(nft)
      .set({
        mintedOnBlockHeight: height,
        airDroppedOnBlockHeight: height,
        mintPrice: mintPrice ?? "0",
        mintDenom: mintDenom,
        owner: recipient
      })
      .where(and(eq(nft.tokenId, normalizedTokenId), eq(nft.collection, dbCollection.address)))
      .returning();

    const dbNft =
      updated ||
      (
        await dbTransaction
          .insert(nft)
          .values({
            tokenId: normalizedTokenId,
            metadata: {},
            collection: dbCollection.address,
            createdOnBlockHeight: height,
            mintedOnBlockHeight: height,
            airDroppedOnBlockHeight: height,
            mintPrice: mintPrice ?? "0",
            mintDenom: mintDenom,
            owner: recipient
          })
          .onConflictDoNothing()
          .returning()
      )[0];

    if (dbNft) {
      await dbTransaction
        .insert(nftMint)
        .values({
          nftId: dbNft.id,
          minter,
          recipient,
          mintPrice: mintPrice ?? "0",
          mintDenom: mintDenom,
          mintBlockHeight: height,
          isAirdrop: true,
          transactionId: txId ?? null,
          transactionEventId: mintEvent?.id ?? null
        })
        .onConflictDoNothing();
    }
  }

  private async setNftForSale(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    height: number,
    marketContractAddress: string,
    seller: string,
    tokenIdFromMsg: string,
    priceAmountFromMsg: string,
    priceDenomFromMsg: string,
    txId?: string
  ) {
    const setAskEvent = findEventsByType(txEvents, "set-ask")[0];
    const collectionAddress =
      getEventAttributeValue(txEvents, "set-ask", "collection") ||
      getEventAttributeValue(txEvents, "wasm", "collection");
    const tokenId = getEventAttributeValue(txEvents, "set-ask", "token_id") || tokenIdFromMsg;
    const normalizedTokenId = tokenId && parseTokenId(tokenId);
    const sellPriceStr = getEventAttributeValue(txEvents, "set-ask", "price");
    const sellPrice = sellPriceStr ? parseCoins(sellPriceStr)[0] : { amount: priceAmountFromMsg, denom: priceDenomFromMsg };

    const dbCollection =
      (collectionAddress
        ? await dbTransaction.query.collection.findFirst({
            where: (collection, { or, eq }) =>
              or(
                eq(collection.address, collectionAddress),
                eq(collection.mintContract, collectionAddress),
                eq(collection.marketContract, collectionAddress)
              ),
          })
        : null) ||
      (await dbTransaction.query.collection.findFirst({
        where: (collection, { eq }) => eq(collection.marketContract, marketContractAddress),
      }));

    if (!dbCollection) {
      throw new Error(`Collection not found for market ${marketContractAddress}`);
    }

    if (!normalizedTokenId) {
      throw new Error(`Token id not found for collection ${dbCollection.address}`);
    }

    if (!sellPrice?.amount) {
      throw new Error(`Selling price not found for token ${normalizedTokenId}`);
    }

    await ensureDenom(dbTransaction, sellPrice.denom);

    const dbNft = await dbTransaction.query.nft.findFirst({
      where: (nft, { and, eq }) => and(eq(nft.tokenId, normalizedTokenId), eq(nft.collection, dbCollection.address))
    });

    if (!dbNft) {
      throw new Error(`Nft not found for token ${normalizedTokenId} collection ${dbCollection.address}`);
    }

    const lastListing = await dbTransaction.query.nftListing.findFirst({
      where: (nftListing, { and, eq }) => and(eq(nftListing.nft, dbNft.id)),
      orderBy: (nftListing, { desc }) => desc(nftListing.forSaleBlockHeight)
    });

    if (lastListing && !lastListing.unlistedBlockHeight) {
      await dbTransaction.update(nftListing).set({ unlistedBlockHeight: height }).where(eq(nftListing.id, lastListing.id));
    }

    const [insertedListing] = await dbTransaction
      .insert(nftListing)
      .values({
        owner: seller,
        marketContract: marketContractAddress,
        nft: dbNft.id,
        rawTokenId: tokenId,
        forSalePrice: sellPrice.amount,
        forSaleDenom: sellPrice.denom,
        forSaleBlockHeight: height,
        transactionEventId: setAskEvent?.id ?? null
      })
      .onConflictDoNothing()
      .returning();

    if (insertedListing) {
      await dbTransaction
        .update(nft)
        .set({
          activeListingId: insertedListing.id,
          owner: marketContractAddress
        })
        .where(eq(nft.id, dbNft.id));
    }

    if (findEventsByType(txEvents, "finalize-sale").length > 0) {
      await this.executeNftSale(dbTransaction, txEvents, normalizedTokenId, height, marketContractAddress, "fixed_price", txId);
    }
  }

  private async removeNftSale(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    height: number,
    marketContractAddress: string,
    tokenIdFromMsg: string,
    seller: string,
    txId?: string
  ) {
    const collectionAddress =
      getEventAttributeValue(txEvents, "remove-ask", "collection") ||
      getEventAttributeValue(txEvents, "wasm", "collection");
    const tokenId = getEventAttributeValue(txEvents, "remove-ask", "token_id") || tokenIdFromMsg;
    const normalizedTokenId = tokenId && parseTokenId(tokenId);

    if (!normalizedTokenId) throw new Error(`Token id not found for remove ask`);

    const dbCollection =
      (collectionAddress
        ? await dbTransaction.query.collection.findFirst({
            where: (collection, { or, eq }) =>
              or(eq(collection.address, collectionAddress), eq(collection.mintContract, collectionAddress))
          })
        : null) ||
      (await dbTransaction.query.collection.findFirst({
        where: (collection, { eq }) => eq(collection.marketContract, marketContractAddress),
      }));

    if (!dbCollection) {
      throw new Error(`Collection not found for remove ask (market ${marketContractAddress})`);
    }

    const dbNft = await dbTransaction.query.nft.findFirst({
      where: (nft, { and, eq }) => and(eq(nft.tokenId, normalizedTokenId), eq(nft.collection, dbCollection.address))
    });

    if (!dbNft) {
      throw new Error(`Nft not found for token ${tokenId} in ${dbCollection.address}`);
    }

    if (!dbNft.activeListingId) {
      return;
    }

    await dbTransaction.update(nftListing).set({ unlistedBlockHeight: height }).where(eq(nftListing.id, dbNft.activeListingId));
    await dbTransaction
      .update(nft)
      .set({ activeListingId: null, owner: seller })
      .where(eq(nft.id, dbNft.id));
  }

  private async setNftBid(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    height: number,
    _tokenId: string,
    owner: string,
    amount: string,
    denom: string,
    marketContractAddress: string,
    txId?: string
  ) {
    const tokenId = parseTokenId(_tokenId);

    const [dbNft] = await dbTransaction
      .select({ id: nft.id })
      .from(nft)
      .innerJoin(collection, eq(collection.address, nft.collection))
      .where(and(/*isNotNull(nft.owner),*/ eq(nft.tokenId, tokenId), eq(collection.marketContract, marketContractAddress)));

    if (!dbNft) {
      throw new Error(`Nft not found for ${tokenId} in ${marketContractAddress}`);
    }

    const wasRefunded = findEventsByType(txEvents, "refund-bidder").some((e) =>
      getEventAttributeValue([e], "refund-bidder", "recipient") === owner
    );

    // Removed temporarily due to bug in the contract (PROBABLY). Founds keeps on the smart_contract
    // const matchOutcome = getEventAttributeValue(txEvents, "wasm-match-bid", "outcome");
    // const wasTooLow = matchOutcome === "bid-too-low";

    const wasFinalized = findEventsByType(txEvents, "finalize-sale").length > 0;

    const removedBlockHeight = wasFinalized || wasRefunded ? height : null;

    if (wasFinalized) {
      await this.executeNftSale(dbTransaction, txEvents, tokenId, height, marketContractAddress, "fixed_price", txId);
    }

    const bidEvent = findEventsByType(txEvents, "set-bid")[0];

    await ensureDenom(dbTransaction, denom);

    await dbTransaction.insert(nftBid).values({
      owner: owner,
      marketContract: marketContractAddress,
      nft: dbNft.id,
      rawTokenId: _tokenId,
      bidPrice: amount,
      bidDenom: denom,
      bidBlockHeight: height,
      removedBlockHeight,
      transactionEventId: bidEvent?.id ?? null
    }).onConflictDoNothing();
  }

  private async removeNftBid(
      dbTransaction: DbTransaction,
      txEvents: TransactionEventWithAttributes[],
      _tokenId: string | number,
      owner: string,
      height: number,
      marketContractAddress: string,
      txId?: string
  ) {
    const tokenId = typeof _tokenId === "number" ? _tokenId : parseTokenId(_tokenId);

    const nftRows = await dbTransaction
        .select({ id: nft.id })
        .from(nft)
        .innerJoin(collection, eq(collection.address, nft.collection))
        .where(and(
            eq(nft.tokenId, tokenId),
            eq(collection.marketContract, marketContractAddress),
        ));

    if (!nftRows.length) {
      throw new Error(`NFT not found for tokenId=${tokenId} in market=${marketContractAddress}`);
    }

    const nftIds = nftRows.map(r => r.id);


    await dbTransaction
        .update(nftBid)
        .set({removedBlockHeight: height})
        .where(and(
            inArray(nftBid.nft, nftIds),
            eq(nftBid.owner, owner),
            isNull(nftBid.removedBlockHeight)
        ));
  }


  private async setNftCollectionBid(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    height: number,
    owner: string,
    amount: string,
    denom: string,
    units: number,
    fundsAmount: string,
    fundsDenom: string,
    marketContractAddress: string,
    txId?: string
  ) {
    const [dbCollection] = await dbTransaction.select().from(collection).where(eq(collection.marketContract, marketContractAddress));

    if (!dbCollection) {
      throw new Error(`Collection not found ${marketContractAddress}`);
    }

    const existingBid = await dbTransaction.query.nftCollectionBid.findFirst({
      where: and(
          eq(nftCollectionBid.collection, dbCollection.address),
          eq(nftCollectionBid.owner, owner),
          isNull(nftCollectionBid.removedBlockHeight)
      )
    });

    if (existingBid) {
      await dbTransaction
          .update(nftCollectionBid)
          .set({ removedBlockHeight: height })
          .where(eq(nftCollectionBid.id, existingBid.id));
    }

    const bidEvent = findEventsByType(txEvents, "set-collection-bid")[0];

    await ensureDenoms(dbTransaction, [denom, fundsDenom]);

    await dbTransaction.insert(nftCollectionBid).values({
      owner: owner,
      marketContract: marketContractAddress,
      collection: dbCollection.address,
      bidPrice: amount,
      bidDenom: denom,
      bidBlockHeight: height,
      units: units,
      fundsAmount: fundsAmount,
      fundsDenom: fundsDenom,
      transactionEventId: bidEvent?.id ?? null
    }).onConflictDoNothing();
  }

  private async removeNftCollectionBid(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    owner: string,
    height: number,
    marketContractAddress: string,
    txId?: string
  ) {
    const [dbCollection] = await dbTransaction.select().from(collection).where(eq(collection.marketContract, marketContractAddress));

    if (!dbCollection) {
      throw new Error(`Collection not found ${marketContractAddress}`);
    }

    const bid = await dbTransaction.query.nftCollectionBid.findFirst({
      where: and(eq(nftCollectionBid.collection, dbCollection.address), eq(nftCollectionBid.owner, owner), isNull(nftCollectionBid.removedBlockHeight))
    });

    if (!bid) {
      throw new Error(`Collection bid not found for ${dbCollection.address} in ${marketContractAddress}`);
    }

    await dbTransaction
      .update(nftCollectionBid)
      .set({
        removedBlockHeight: height
      })
      .where(eq(nftCollectionBid.id, bid.id));
  }

  private async acceptCollectionBid(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    tokenId: number,
    bidder: string,
    height: number,
    marketContractAddress: string,
    txId?: string
  ) {
    const [{ nft_collection_bid: dbNftCollectionBid, collection: dbCollection, nft: dbNft }] = await dbTransaction
      .select()
      .from(nftCollectionBid)
      .innerJoin(collection, eq(collection.address, nftCollectionBid.collection))
      .innerJoin(nft, eq(nft.collection, collection.address))
      .where(and(eq(nft.tokenId, tokenId), eq(collection.marketContract, marketContractAddress), isNull(nftCollectionBid.removedBlockHeight)));

    if (!dbNftCollectionBid) {
      throw new Error(`Nft collection bid not found for ${tokenId} in ${marketContractAddress}`);
    }

    if (!dbNft) {
      throw new Error(`Nft not found for ${tokenId} in ${dbCollection.address}`);
    }

    if (!dbNft.owner) {
      throw new Error(`Owner missing for ${tokenId} in ${dbCollection.address}`);
    }

    // Remove ask if there is only one unit, otherwise decrease the units
    if (dbNftCollectionBid.units === 1) {
      await dbTransaction
        .update(nftCollectionBid)
        .set({
          removedBlockHeight: height
        })
        .where(eq(nftCollectionBid.id, dbNftCollectionBid.id));
    } else {
      await dbTransaction
        .update(nftCollectionBid)
        .set({
          units: (dbNftCollectionBid.units as number) - 1
        })
        .where(and(eq(nftCollectionBid.id, dbNftCollectionBid.id)));
    }

    this.executeNftSale(dbTransaction, txEvents, tokenId, height, marketContractAddress, "fixed_price", txId);
  }

  private async acceptBid(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    tokenId: number,
    bidder: string,
    height: number,
    marketContractAddress: string,
    txId?: string
  ) {
    const [{ nft_bid: dbNftBid, collection: dbCollection, nft: dbNft }] = await dbTransaction
      .select()
      .from(nftBid)
      .innerJoin(nft, eq(nft.id, nftBid.nft))
      .innerJoin(collection, eq(nft.collection, collection.address))
      .where(and(eq(nft.tokenId, tokenId), eq(collection.marketContract, marketContractAddress), isNull(nftBid.removedBlockHeight)));

    if (!dbNftBid) {
      throw new Error(`Nft bid not found for ${tokenId} in ${marketContractAddress}`);
    }

    if (!dbNft) {
      throw new Error(`Nft not found for ${tokenId} in ${dbCollection.address}`);
    }

    if (!dbNft.owner) {
      throw new Error(`Owner missing for ${tokenId} in ${dbCollection.address}`);
    }

    await dbTransaction
      .update(nftBid)
      .set({
        removedBlockHeight: height
      })
      .where(eq(nftBid.id, dbNftBid.id));

    this.executeNftSale(dbTransaction, txEvents, tokenId, height, marketContractAddress, "fixed_price", txId);
  }

  private async transferNft(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    _tokenId: string,
    height: number,
    contractAddress: string,
    fromOwner: string,
    toOwner: string,
    txId?: string
  ) {
    const tokenId = parseTokenId(_tokenId);
    const [{ nft: dbNft }] = await dbTransaction
      .select()
      .from(nft)
      .innerJoin(collection, eq(collection.address, nft.collection))
      .where(and(isNotNull(nft.owner), eq(nft.tokenId, tokenId), or(eq(collection.address, contractAddress), eq(collection.mintContract, contractAddress))));

    if (!dbNft) {
      throw new Error(`Nft not found for ${tokenId} in ${contractAddress}`);
    }

    if (fromOwner !== dbNft.owner) {
      throw new Error(`Owner mismatch for ${tokenId}`);
    }

    const transferEvent =
      findEventsByType(txEvents, "transfer-nft")[0] ||
      findEventsByType(txEvents, "transfer")[0] ||
      findEventsByType(txEvents, "wasm")[0];

    await dbTransaction.insert(nftTransfer).values({
      fromOwner: dbNft.owner,
      toOwner: toOwner,
      transferredOnBlockHeight: height,
      nftId: dbNft.id,
      transactionId: txId ?? null,
      transactionEventId: transferEvent?.id ?? null
    }).onConflictDoNothing();

    // Remove listing of the older owner
    await dbTransaction.update(nftListing).set({ unlistedBlockHeight: height })
        .where(and(eq(nftListing.nft, dbNft.id), isNull(nftListing.unlistedBlockHeight)));

    await dbTransaction
      .update(nft)
      .set({
        owner: toOwner,
        activeListingId: null
      })
      .where(and(eq(nft.id, dbNft.id)));
  }

  private async executeNftSale(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    tokenId: number,
    height: number,
    sourceContract: string,
    saleType: "fixed_price" | "auction_english" | "unknown",
    txId?: string
  ) {
    const finalizeEvent = findEventsByType(txEvents, "finalize-sale")[0];
    const collectionAddress = getEventAttributeValue(txEvents, "finalize-sale", "collection");
    const buyer = getEventAttributeValue(txEvents, "finalize-sale", "buyer");
    const paymentAmountStr = getEventAttributeValue(txEvents, "finalize-sale", "payment_amount");

    const payoutMarketPriceStr = getEventAttributeValue(txEvents, "payout-market", "coin");
    const payoutMarketPrice = payoutMarketPriceStr ? parseCoins(payoutMarketPriceStr)[0] : undefined;
    const royaltyPriceStr = getEventAttributeValue(txEvents, "payout-royalty", "coin");
    const royaltyPrice = royaltyPriceStr ? parseCoins(royaltyPriceStr)[0] : undefined;
    const royaltyRecipient = getEventAttributeValue(txEvents, "payout-royalty", "recipient");
    const payoutSellerPriceStr = getEventAttributeValue(txEvents, "payout-seller", "coin");
    const payoutSellerPrice = payoutSellerPriceStr ? parseCoins(payoutSellerPriceStr)[0] : undefined;

    if (!buyer) throw new Error(`Buyer not found for ${tokenId}`);

    const dbCollection =
      (collectionAddress
        ? await dbTransaction.query.collection.findFirst({
            where: (collection, { or, eq }) =>
              or(eq(collection.address, collectionAddress), eq(collection.mintContract, collectionAddress))
          })
        : null) ||
      (await dbTransaction.query.collection.findFirst({
        where: (collection, { eq }) => or(eq(collection.marketContract, sourceContract), eq(collection.auctionContract, sourceContract))
      }));

    if (!dbCollection) {
      throw new Error(`Collection not found for sale contract ${sourceContract}`);
    }

    const [{ nft: dbNft }] = await dbTransaction
      .select()
      .from(nft)
      .innerJoin(collection, eq(collection.address, nft.collection))
      .where(and(isNotNull(nft.owner), eq(nft.tokenId, tokenId), eq(collection.address, dbCollection.address)));

    if (!dbNft) {
      throw new Error(`Nft not found for ${tokenId} in ${dbCollection.address}`);
    }

    const saleDenom =
      payoutSellerPrice?.denom ||
      payoutMarketPrice?.denom ||
      royaltyPrice?.denom ||
      dbCollection.marketDenom ||
      dbCollection.auctionDenom ||
      activeChain.udenom;

    await ensureDenoms(dbTransaction, [
      saleDenom,
      payoutSellerPrice?.denom ?? null,
      payoutMarketPrice?.denom ?? null,
      royaltyPrice?.denom ?? null
    ]);

    const marketFeeAmount = payoutMarketPrice?.amount ?? "0";
    const royaltyFeeAmount = royaltyPrice?.amount ?? "0";
    const sellerAmount =
      payoutSellerPrice?.amount ??
      (paymentAmountStr
        ? (BigInt(paymentAmountStr) - BigInt(marketFeeAmount) - BigInt(royaltyFeeAmount)).toString()
        : "0");

    await dbTransaction
      .insert(nftSale)
      .values({
        previousOwner: dbNft.owner!,
        newOwner: buyer,
        nft: dbNft.id,
        salePrice: sellerAmount,
        saleDenom: saleDenom,
        saleBlockHeight: height,
        sourceContract: sourceContract,
        saleType: saleType,
        transactionId: txId ?? null,
        transactionEventId: finalizeEvent?.id ?? null,
        marketFee: marketFeeAmount,
        marketFeeDenom: payoutMarketPrice?.denom ?? saleDenom,
        royaltyFee: royaltyFeeAmount,
        royaltyFeeDenom: royaltyPrice?.denom ?? saleDenom,
        royaltyFeeAddress: royaltyRecipient ?? dbCollection.royaltyAddress ?? null
      })
      .onConflictDoNothing();

    await dbTransaction
      .update(nftListing)
      .set({
        unlistedBlockHeight: height
      })
      .where(
        and(eq(nftListing.nft, dbNft.id), eq(nftListing.owner, dbNft.owner!), isNull(nftListing.unlistedBlockHeight))
      );

    const nftBidDb = await dbTransaction.query.nftBid.findFirst({
      where: and(eq(nftBid.nft, dbNft.id), eq(nftBid.owner, buyer), isNull(nftBid.removedBlockHeight))
    });

    if (nftBidDb) {
      await dbTransaction
        .update(nftBid)
        .set({
          removedBlockHeight: height
        })
        .where(eq(nftBid.id, nftBidDb.id));
    }

    await dbTransaction
      .update(nft)
      .set({
        activeListingId: null,
        owner: buyer
      })
      .where(eq(nft.id, dbNft.id));
  }

  private async insertNftTraits(
      dbTransaction: DbTransaction,
      dbNft: Nft,
      height: number,
      metadata: any
  ) {
    const _metadata = NftMetadataSchema.safeParse(metadata);
    if (!_metadata.success) {
      //TODO: CHECK IF IS NECESSARY TO THROW AN EXCEPTION. SMART CONTRACT Recieve any value as metadata object
      //throw new Error(`Invalid metadata for ${dbNft.id}`);
      return;
    }

    const { data } = _metadata;

    await dbTransaction
        .update(nft)
        .set({
          name: data.name,
          description: data.description,
          image: data.image,
          externalUrl: data.external_url,
          backgroundColor: data.background_color,
          animationUrl: data.animation_url,
          youtubeUrl: data.youtube_url
        })
        .where(eq(nft.id, dbNft.id));

    await dbTransaction
        .delete(nftToTrait)
        .where(eq(nftToTrait.nftId, dbNft.id));


    type InAttr = {
      trait_type: string | null | undefined;
      value: string | number | boolean | null | undefined;
      display_type?: string | null;
    };

    const attrs = (data.attributes ?? []) as InAttr[];

    const uniq = new Map<string, InAttr>();
    for (const a of attrs) {
      const traitType = (a.trait_type ?? "").toString().trim();
      const traitValue = a.value === null || a.value === undefined ? "" : String(a.value).trim();
      const displayType = a.display_type ?? null;

      if (!traitType || traitValue === "") continue;

      const key = `${traitType}::${traitValue}::${displayType ?? "NULL"}`;
      if (!uniq.has(key)) uniq.set(key, { trait_type: traitType, value: traitValue, display_type: displayType });
    }

    for (const { trait_type, value, display_type } of uniq.values()) {
      const filters = [
        eq(collection.address, dbNft.collection as string),
        eq(nftTrait.traitType, trait_type!),
        eq(nftTrait.traitValue, value as string)
      ];

      const displayFilter =
          display_type === null || display_type === undefined
              ? isNull(nftTrait.displayType)
              : eq(nftTrait.displayType, display_type);

      const existingTrait = await dbTransaction
          .select({ id: nftTrait.id })
          .from(nftTrait)
          .innerJoin(collection, eq(nftTrait.collection, collection.address))
          .where(and(...filters, displayFilter))
          .limit(1);

      let traitId: string;

      if (existingTrait.length > 0) {
        traitId = existingTrait[0].id;
      } else {
        const [inserted] = await dbTransaction
            .insert(nftTrait)
            .values({
              collection: dbNft.collection as string,
              displayType: display_type ?? null,
              traitType: trait_type!,
              traitValue: value as string
            })
            .returning({ id: nftTrait.id });

        traitId = inserted.id;
      }

      await dbTransaction.insert(nftToTrait).values({
        nftId: dbNft.id,
        traitId
      });
    }
  }

  private async handleCreateWhitelist(
    height: number,
    admin: string,
    label: string,
    whitelistInfo: WhitelistInfoTx,
    msg: Message,
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[]
  ) {
    const whitelistAddress = getEventAttributeValue(txEvents, "instantiate", "_contract_address");

    if (!whitelistAddress) throw new Error("Whitelist address not found");
    if (!admin) throw new Error("Admin not found");

    await ensureDenom(dbTransaction, whitelistInfo.unit_price.denom);

    const [insertedWhitelist] = await dbTransaction
        .insert(whitelist)
        .values({
          admin,
          address: whitelistAddress,
          endTime: new Date(parseInt(whitelistInfo.end_time) / 1_000_000),
          startTime: new Date(parseInt(whitelistInfo.start_time) / 1_000_000),
          memberLimit: whitelistInfo.member_limit,
          numMembers: whitelistInfo.members.length,
          perAddressLimit: whitelistInfo.per_address_limit,
          unitPrice: whitelistInfo.unit_price.amount,
          unitDenom: whitelistInfo.unit_price.denom
        })
        .returning();

    // Insert whitelist members
    if (whitelistInfo.members.length > 0) {
      await dbTransaction.insert(whitelistMember).values(
        whitelistInfo.members.map((address) => ({
          address,
          whitelist: insertedWhitelist.id
        }))
      );
    }
  }

  private async handleAddWhitelistMembers(dbTransaction: DbTransaction, whitelistAddress: string, whitelistAddMembers: WhitelistAddMembersTx, height: number) {
    // Get the whitelist from the database
    const dbWhitelist = await dbTransaction.query.whitelist.findFirst({
      where: (whitelist, { eq }) => eq(whitelist.address, whitelistAddress)
    });

    if (!dbWhitelist) {
      throw new Error(`Whitelist not found for address ${whitelistAddress}`);
    }

    // Insert new whitelist members
    await dbTransaction.insert(whitelistMember).values(
      whitelistAddMembers.add_members.to_add.map((address) => ({
        address,
        whitelist: dbWhitelist.id
      }))
    );

    // Update the number of members in the whitelist
    await dbTransaction
      .update(whitelist)
      .set({
        numMembers: dbWhitelist.numMembers + whitelistAddMembers.add_members.to_add.length
      })
      .where(eq(whitelist.id, dbWhitelist.id));
  }

  private async handleRemoveWhitelistMembers(
    dbTransaction: DbTransaction,
    whitelistAddress: string,
    whitelistRemoveMembers: any,
    height: number
  ) {
    const dbWhitelist = await dbTransaction.query.whitelist.findFirst({
      where: (whitelist, { eq }) => eq(whitelist.address, whitelistAddress)
    });

    if (!dbWhitelist) {
      throw new Error(`Whitelist not found for address ${whitelistAddress}`);
    }

    const toRemove = whitelistRemoveMembers.remove_members.to_remove;
    if (!toRemove.length) return;

    await dbTransaction
      .delete(whitelistMember)
      .where(
        and(
          eq(whitelistMember.whitelist, dbWhitelist.id),
          inArray(whitelistMember.address, toRemove)
        )
      );

    await dbTransaction
      .update(whitelist)
      .set({
        numMembers: Math.max(0, dbWhitelist.numMembers - toRemove.length)
      })
      .where(eq(whitelist.id, dbWhitelist.id));
  }

  private async updateWhitelistStartTime(dbTransaction: DbTransaction, whitelistAddress: string, startTime: string) {
    await dbTransaction
      .update(whitelist)
      .set({
        startTime: new Date(parseInt(startTime) / 1_000_000)
      })
      .where(eq(whitelist.address, whitelistAddress));
  }

  private async updateWhitelistEndTime(dbTransaction: DbTransaction, whitelistAddress: string, endTime: string) {
    await dbTransaction
      .update(whitelist)
      .set({
        endTime: new Date(parseInt(endTime) / 1_000_000)
      })
      .where(eq(whitelist.address, whitelistAddress));
  }

  private async updateWhitelistPerAddressLimit(dbTransaction: DbTransaction, whitelistAddress: string, perAddressLimit: number) {
    await dbTransaction
      .update(whitelist)
      .set({
        perAddressLimit: perAddressLimit
      })
      .where(eq(whitelist.address, whitelistAddress));
  }

  private async updateWhitelistMemberLimit(dbTransaction: DbTransaction, whitelistAddress: string, memberLimit: number) {
    await dbTransaction
      .update(whitelist)
      .set({
        memberLimit: memberLimit
      })
      .where(eq(whitelist.address, whitelistAddress));
  }

  private async updateCollectionWhitelist(dbTransaction: DbTransaction, contractAddress: string, whitelistAddress: string | null) {
    if (!whitelistAddress) {
      await dbTransaction
        .update(collection)
        .set({ whitelist: null })
        .where(or(eq(collection.address, contractAddress), eq(collection.mintContract, contractAddress)));
      return;
    }

    const dbWhitelist = await dbTransaction.query.whitelist.findFirst({
      where: (whitelist, { eq }) => eq(whitelist.address, whitelistAddress)
    });

    await dbTransaction
      .update(collection)
      .set({ whitelist: dbWhitelist ? dbWhitelist.id : null })
      .where(or(eq(collection.address, contractAddress), eq(collection.mintContract, contractAddress)));
  }

  public async afterEveryBlock(
    currentBlock: Block,
    previousBlock: Block | undefined,
    events: BlockEventWithAttributes[],
    dbTransaction: DbTransaction
  ): Promise<void> {
    return Promise.resolve();
  }

  public async afterEveryTransaction(rawTx: DecodedTxRaw, currentTransaction: Transaction, dbTransaction: DbTransaction): Promise<void> {
    // const { multisigThreshold, addresses } = this.getTransactionSignerAddresses(rawTx, currentTransaction.hash);
    // currentTransaction.multisigThreshold = multisigThreshold;
    // await dbTransaction.insert(addressReference).values(
    //   addresses.map((address) => ({
    //     messageId: null,
    //     transactionId: currentTransaction.id,
    //     address: address,
    //     type: "Signer"
    //   }))
    // );
  }
}
