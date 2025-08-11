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
  nftSale,
  nftBid,
  or,
  nftTransfer,
  nftListing,
  isNotNull,
  nftCollectionBid,
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
  WhitelistAddMembersTx
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
import {getEventAttributeValue, getEventsAttributeValuesGrouped, parseTokenId} from "@src/shared/utils/nftUtils";
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
      createZodHandler(CollectionMarketplaceTxSchema, (collectionMarketplaceTx) =>
        this.insertMarketplaceData(height, dbTransaction, collectionMarketplaceTx,msg, txEvents)
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
      createZodHandler(NftMintTxSchema, (nftMint) => this.mintNft(dbTransaction, txEvents, height)),
      createZodHandler(NftSetAskSchema, (nftSetAsk) => this.setNftForSale(dbTransaction, txEvents, height)),
      createZodHandler(NftRemoveAskSchema, (nftRemoveAsk) => this.removeNftSale(dbTransaction, txEvents, nftRemoveAsk.remove_ask.token_id, height)),
      createZodHandler(NftSetBidSchema, (nftSetBid) =>
        this.setNftBid(
          dbTransaction,
          txEvents,
          height,
          nftSetBid.set_bid.token_id,
          decodedMessage.sender,
          nftSetBid.set_bid.price.amount,
          nftSetBid.set_bid.price.denom
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
          funds.denom
        );
      }),
      createZodHandler(NftRemoveBidSchema, (nftRemoveBid) =>
        this.removeNftBid(dbTransaction, txEvents, nftRemoveBid.remove_bid.token_id, decodedMessage.sender, height)
      ),
      createZodHandler(NftTransferSchema, (nftTransfer) =>
        this.transferNft(
          dbTransaction,
          txEvents,
          nftTransfer.transfer_nft.token_id,
          height,
          decodedMessage.contract,
          decodedMessage.sender,
          nftTransfer.transfer_nft.recipient
        )
      ),
      createZodHandler(NftRemoveCollectionBidSchema, (nftRemoveCollectionBid) =>
        this.removeNftCollectionBid(dbTransaction, txEvents, decodedMessage.sender, height)
      ),
      createZodHandler(NftAcceptCollectionBidSchema, (nftAcceptCollectionBid) =>
        this.acceptCollectionBid(dbTransaction, txEvents, parseTokenId(nftAcceptCollectionBid.accept_collection_bid.token_id), height)
      ),
      createZodHandler(NftAcceptBidSchema, (nftAcceptBid) => this.acceptBid(dbTransaction, txEvents, parseTokenId(nftAcceptBid.accept_bid.token_id), height)),
      createZodHandler(NftMintToSchema, (nftMintTo) => this.mintToNft(dbTransaction, txEvents, decodedMessage.contract, nftMintTo.mint_to.recipient, height)),
      /* Untracked transactions for now */
      createZodHandler(CollectionMigrationMinterTxSchema, (collectionMigrationMinter) => console.log("Ignored Type: CollectionMigrationMinterTxSchema")),
      createZodHandler(CollectionMigrationMintableTokensTxSchema, (collectionMigrationMintableTokens) =>
        console.log("Ignored Type: CollectionMigrationMintableTokensTxSchema")
      ),
      createZodHandler(CollectionSetAdminSchema, (collectionSetAdmin) => console.log("Ignored Type: CollectionSetAdminSchema")),
      createZodHandler(CollectionWithdrawSchema, (collectionWithdraw) => console.log("Ignored Type: CollectionWithdrawSchema")),
      createZodHandler(WhitelistAddMembersSchema, (whitelistAddMembers) =>
        this.handleAddWhitelistMembers(dbTransaction, decodedMessage.contract, whitelistAddMembers, height)
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

    await dbTransaction
      .update(collection)
      .set({
        collectorAddress: collectionMarketplaceTx.collector_address,
        marketContract: marketContractAddress,
        tradingFeeBps: collectionMarketplaceTx.trading_fee_bps?.toString(),
        minPrice: collectionMarketplaceTx.min_price
      })
      .where(eq(collection.address, collectionMarketplaceTx.cw721_address));
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
          metadata: token_migration.extension,
          collection: dbCollection.address,
          createdOnBlockHeight: height
        })
        .returning();

      await this.insertNftTraits(dbTransaction, dbNft[0], height, token_migration.extension);
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
          metadata: token_migration.metadata,
          collection: dbCollection.address,
          createdOnBlockHeight: height,
          mintedOnBlockHeight: token_migration.is_minted ? height : null
        })
        .onConflictDoUpdate({
          target: [nft.collection, nft.tokenId],
          set: {
            metadata: token_migration.metadata
          }
        })
        .returning();

      await this.insertNftTraits(dbTransaction, dbNft[0], height, token_migration.metadata);
    }
  }

  private async insertCollectionMetadata(dbTransaction: DbTransaction, collectionMetadata: CollectionMetadataTx, mintContract: string, height: number) {
    const dbCollection = await dbTransaction.query.collection.findFirst({
      where: (collection, { eq }) => eq(collection.mintContract, mintContract)
    });

    if (!dbCollection) {
      throw new Error(`Collection not found for mint contract ${mintContract}`);
    }

    for (const token_metadata of collectionMetadata.upsert_token_metadatas.token_metadatas) {
      const dbNft = await dbTransaction
        .insert(nft)
        .values({
          tokenId: token_metadata.token_id,
          metadata: token_metadata.metadata,
          collection: dbCollection.address,
          createdOnBlockHeight: height
        })
        .onConflictDoUpdate({
          target: [nft.collection, nft.tokenId],
          set: {
            metadata: token_metadata.metadata
          }
        })
        .returning();

      await this.insertNftTraits(dbTransaction, dbNft[0], height, token_metadata.metadata);
    }
  }

  private async mintNft(dbTransaction: DbTransaction, txEvents: TransactionEventWithAttributes[], height: number) {

    const eventValues = getEventsAttributeValuesGrouped(txEvents, [{
      eventType: "wasm",
      attributeKeys: [{
          key: "token_id", required: true
      },{
          key: "mint_price", required: true
      }, {
          key: "_contract_address", required: true
      }]
    }])

    const owner = getEventAttributeValue(txEvents, "coin_spent", "spender");

    for (const eventValue of eventValues) {

      console.log(eventValue)

      const tokenId = eventValue["wasm"]?.token_id;
      const normalizedTokenId = tokenId && parseTokenId(tokenId);
      const mintPrice = eventValue["wasm"]?.mint_price;
      const minterOrCollectionAddress = eventValue["wasm"]?._contract_address;

      if (!minterOrCollectionAddress) throw new Error(`Minter or collection address not found (#${height}) index for token ${normalizedTokenId}`);

      const dbCollection = await dbTransaction.query.collection.findFirst({
        where: (collection, { or, eq }) => or(eq(collection.address, minterOrCollectionAddress), eq(collection.mintContract, minterOrCollectionAddress))
      });

      if (!dbCollection) {
        throw new Error(`Collection not found for mint contract ${minterOrCollectionAddress}`);
      }

      if (!normalizedTokenId) {
        throw new Error(`Token id not found for collection ${dbCollection.address}`);
      }

      if (!mintPrice) {
        throw new Error(`Mint price not found for token ${normalizedTokenId}`);
      }

      if (!owner) {
        throw new Error(`Owner not found for token ${normalizedTokenId}`);
      }

      await dbTransaction
          .update(nft)
          .set({
            mintedOnBlockHeight: height,
            mintPrice: mintPrice,
            mintDenom: dbCollection.unitDenom || "upasg",
            owner: owner
          })
          .where(and(eq(nft.tokenId, normalizedTokenId), eq(nft.collection, dbCollection.address)));
    }
  }

  private async mintToNft(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    contractAddress: string,
    recipient: string,
    height: number
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

    await dbTransaction
      .update(nft)
      .set({
        mintedOnBlockHeight: height,
        airDroppedOnBlockHeight: height,
        mintPrice: mintPrice,
        mintDenom: dbCollection.unitDenom || "upasg",
        owner: recipient
      })
      .where(and(eq(nft.tokenId, normalizedTokenId), eq(nft.collection, dbCollection.address)));
  }

  private async setNftForSale(dbTransaction: DbTransaction, txEvents: TransactionEventWithAttributes[], height: number) {
    const collectionAddress = getEventAttributeValue(txEvents, "wasm-set-ask", "collection");
    const tokenId = getEventAttributeValue(txEvents, "wasm-set-ask", "token_id");
    const normalizedTokenId = tokenId && parseTokenId(tokenId);
    const seller = getEventAttributeValue(txEvents, "wasm-set-ask", "seller");
    const sellPriceStr = getEventAttributeValue(txEvents, "wasm-set-ask", "price");
    const sellPrice = sellPriceStr && parseCoins(sellPriceStr)[0];

    if (!collectionAddress) throw new Error(`Collection address not found for nft sale (#${height})`);

    const dbCollection = await dbTransaction.query.collection.findFirst({
      where: (collection, { or, eq }) => or(eq(collection.address, collectionAddress), eq(collection.mintContract, collectionAddress))
    });

    if (!dbCollection) {
      throw new Error(`Collection not found for ${collectionAddress}`);
    }

    if (!normalizedTokenId) {
      throw new Error(`Token id not found for collection ${dbCollection.address}`);
    }

    if (!sellPrice) {
      throw new Error(`Selling price not found for token ${normalizedTokenId}`);
    }

    if (!seller) {
      throw new Error(`Seller not found for token ${normalizedTokenId}`);
    }

    const dbNft = await dbTransaction.query.nft.findFirst({
      where: (nft, { and, eq, isNotNull }) => and(eq(nft.tokenId, normalizedTokenId), eq(nft.collection, dbCollection.address), isNotNull(nft.owner))
    });

    if (!dbNft) {
      throw new Error(`Nft not found for token ${normalizedTokenId} collection ${dbCollection.address}`);
    }

    if (txEvents.some((event) => event.type === "wasm-finalize-sale")) {
      await this.executeNftSale(dbTransaction, txEvents, normalizedTokenId, height);
    } else {
      if (!dbNft.owner) {
        throw new Error(`Owner not found for token ${normalizedTokenId} collection ${dbCollection.address}`);
      }

      const insertedListing = await dbTransaction
        .insert(nftListing)
        .values({
          owner: dbNft.owner,
          nft: dbNft.id,
          forSalePrice: sellPrice.amount,
          forSaleDenom: sellPrice.denom,
          forSaleBlockHeight: height
        })
        .returning();

      await dbTransaction
        .update(nft)
        .set({
          activeListingId: insertedListing[0].id
        })
        .where(eq(nft.id, dbNft.id));
    }
  }

  private async removeNftSale(dbTransaction: DbTransaction, txEvents: TransactionEventWithAttributes[], tokenId: string, height: number) {
    const collectionAddress = getEventAttributeValue(txEvents, "wasm-remove-ask", "collection");

    if (!collectionAddress) throw new Error(`Collection address not found for remove ask`);

    const dbCollection = await dbTransaction.query.collection.findFirst({
      where: (collection, { or, eq }) => or(eq(collection.address, collectionAddress), eq(collection.mintContract, collectionAddress))
    });

    if (!dbCollection) {
      throw new Error(`Collection not found for ${collectionAddress}`);
    }

    const dbNft = await dbTransaction.query.nft.findFirst({
      where: (nft, { and, eq }) => and(eq(nft.tokenId, parseTokenId(tokenId)), eq(nft.collection, dbCollection.address))
    });

    if (!dbNft) {
      throw new Error(`Nft not found for ${tokenId} in ${collectionAddress}`);
    }

    if (!dbNft.activeListingId) {
      throw new Error(`Nft ${tokenId} in ${collectionAddress} is not listed`);
    }

    await dbTransaction.update(nftListing).set({ unlistedBlockHeight: height }).where(eq(nftListing.id, dbNft.activeListingId));
    await dbTransaction.update(nft).set({ activeListingId: null }).where(eq(nft.id, dbNft.id));
  }

  private async setNftBid(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    height: number,
    _tokenId: string,
    owner: string,
    amount: string,
    denom: string
  ) {
    const marketContractAddress = getEventAttributeValue(txEvents, "wasm-set-bid", "_contract_address");
    const tokenId = parseTokenId(_tokenId);

    if (!marketContractAddress) throw "Could not find contract address in set bid event";

    const [dbNft] = await dbTransaction
      .select({ id: nft.id })
      .from(nft)
      .innerJoin(collection, eq(collection.address, nft.collection))
      .where(and(/*isNotNull(nft.owner),*/ eq(nft.tokenId, tokenId), eq(collection.marketContract, marketContractAddress)));

    if (!dbNft) {
      throw new Error(`Nft not found for ${tokenId} in ${marketContractAddress}`);
    }

    const wasRefunded = txEvents.some((e) =>
        e.type === "wasm-refund-bidder" &&
        getEventAttributeValue([e], "wasm-refund-bidder", "recipient") === owner
    );

    const matchOutcome = getEventAttributeValue(txEvents, "wasm-match-bid", "outcome");
    const wasTooLow = matchOutcome === "bid-too-low";

    const wasFinalized = txEvents.some((event) => event.type === "wasm-finalize-sale");

    const removedBlockHeight = wasFinalized || wasRefunded || wasTooLow ? height : null;

    if (wasFinalized) {
      await this.executeNftSale(dbTransaction, txEvents, tokenId, height);
    }

    await dbTransaction.insert(nftBid).values({
      owner: owner,
      nft: dbNft.id,
      bidPrice: amount,
      bidDenom: denom,
      bidBlockHeight: height,
      removedBlockHeight
    });
  }

  private async removeNftBid(dbTransaction: DbTransaction, txEvents: TransactionEventWithAttributes[], _tokenId: string, owner: string, height: number) {
    const marketAddress = getEventAttributeValue(txEvents, "wasm-remove-bid", "_contract_address");
    const tokenId = parseTokenId(_tokenId);

    if (!marketAddress) throw "Could not find collection address in remove bid event";

    const [dbNft] = await dbTransaction
      .select({ id: nft.id })
      .from(nft)
      .innerJoin(collection, eq(collection.address, nft.collection))
      .where(and(eq(nft.tokenId, tokenId), eq(collection.marketContract, marketAddress)));

    if (!dbNft) {
      throw new Error(`Nft not found for ${tokenId} in ${marketAddress}`);
    }

    const bid = await dbTransaction.query.nftBid.findFirst({
      where: and(eq(nftBid.nft, dbNft.id), eq(nftBid.owner, owner))
    });

    if (!bid) {
      throw new Error(`Bid not found for ${tokenId} in ${marketAddress}`);
    }

    if (!bid.removedBlockHeight) {
      await dbTransaction
          .update(nftBid)
          .set({
            removedBlockHeight: height
          })
          .where(eq(nftBid.id, bid.id));
    }
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
    fundsDenom: string
  ) {
    const collectionMarketAddress = getEventAttributeValue(txEvents, "wasm-set-collection-bid", "_contract_address");

    if (!collectionMarketAddress) throw "Could not find collection address in set bid event";

    const [dbCollection] = await dbTransaction.select().from(collection).where(eq(collection.marketContract, collectionMarketAddress));

    if (!dbCollection) {
      throw new Error(`Collection not found ${collectionMarketAddress}`);
    }

    await dbTransaction.insert(nftCollectionBid).values({
      owner: owner,
      collection: dbCollection.address,
      bidPrice: amount,
      bidDenom: denom,
      bidBlockHeight: height,
      units: units,
      fundsAmount: fundsAmount,
      fundsDenom: fundsDenom
    });
  }

  private async removeNftCollectionBid(dbTransaction: DbTransaction, txEvents: TransactionEventWithAttributes[], owner: string, height: number) {
    const collectionMarketAddress = getEventAttributeValue(txEvents, "wasm-remove-collection-bid", "_contract_address");

    if (!collectionMarketAddress) throw "Could not find collection address in remove bid event";

    const [dbCollection] = await dbTransaction.select().from(collection).where(eq(collection.marketContract, collectionMarketAddress));

    if (!dbCollection) {
      throw new Error(`Collection not found ${collectionMarketAddress}`);
    }

    const bid = await dbTransaction.query.nftCollectionBid.findFirst({
      where: and(eq(nftCollectionBid.collection, dbCollection.address), eq(nftCollectionBid.owner, owner), isNull(nftCollectionBid.removedBlockHeight))
    });

    if (!bid) {
      throw new Error(`Collection bid not found for ${dbCollection.address} in ${collectionMarketAddress}`);
    }

    await dbTransaction
      .update(nftCollectionBid)
      .set({
        removedBlockHeight: height
      })
      .where(eq(nftCollectionBid.id, bid.id));
  }

  private async acceptCollectionBid(dbTransaction: DbTransaction, txEvents: TransactionEventWithAttributes[], tokenId: number, height: number) {
    const collectionMarketAddress = getEventAttributeValue(txEvents, "wasm-accept-collection-bid", "_contract_address");
    const bidder = getEventAttributeValue(txEvents, "wasm-accept-collection-bid", "bidder");

    if (!collectionMarketAddress) throw "Could not find collection address in accept collection bid event";

    const [{ nft_collection_bid: dbNftCollectionBid, collection: dbCollection, nft: dbNft }] = await dbTransaction
      .select()
      .from(nftCollectionBid)
      .innerJoin(collection, eq(collection.address, nftCollectionBid.collection))
      .innerJoin(nft, eq(nft.collection, collection.address))
      .where(and(eq(nft.tokenId, tokenId), eq(collection.marketContract, collectionMarketAddress), isNull(nftCollectionBid.removedBlockHeight)));

    if (!dbNftCollectionBid) {
      throw new Error(`Nft collection bid not found for ${tokenId} in ${collectionMarketAddress}`);
    }

    if (!dbNft) {
      throw new Error(`Nft not found for ${tokenId} in ${dbCollection.address}`);
    }

    if (!dbNft.owner) {
      throw new Error(`Owner missing for ${tokenId} in ${dbCollection.address}`);
    }

    if (!bidder) {
      throw new Error(`Bidder missing for ${tokenId} in ${dbCollection.address}`);
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

    this.executeNftSale(dbTransaction, txEvents, tokenId, height);
  }

  private async acceptBid(dbTransaction: DbTransaction, txEvents: TransactionEventWithAttributes[], tokenId: number, height: number) {
    const collectionMarketAddress = getEventAttributeValue(txEvents, "wasm-accept-bid", "_contract_address");
    const bidder = getEventAttributeValue(txEvents, "wasm-accept-bid", "bidder");

    if (!collectionMarketAddress) throw "Could not find collection address in accept bid event";

    const [{ nft_bid: dbNftBid, collection: dbCollection, nft: dbNft }] = await dbTransaction
      .select()
      .from(nftBid)
      .innerJoin(nft, eq(nft.id, nftBid.nft))
      .innerJoin(collection, eq(nft.collection, collection.address))
      .where(and(eq(nft.tokenId, tokenId), eq(collection.marketContract, collectionMarketAddress), isNull(nftBid.removedBlockHeight)));

    if (!dbNftBid) {
      throw new Error(`Nft bid not found for ${tokenId} in ${collectionMarketAddress}`);
    }

    if (!dbNft) {
      throw new Error(`Nft not found for ${tokenId} in ${dbCollection.address}`);
    }

    if (!dbNft.owner) {
      throw new Error(`Owner missing for ${tokenId} in ${dbCollection.address}`);
    }

    if (!bidder) {
      throw new Error(`Bidder missing for ${tokenId} in ${dbCollection.address}`);
    }

    await dbTransaction
      .update(nftBid)
      .set({
        removedBlockHeight: height
      })
      .where(eq(nftBid.id, dbNftBid.id));

    this.executeNftSale(dbTransaction, txEvents, tokenId, height);
  }

  private async transferNft(
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    _tokenId: string,
    height: number,
    contractAddress: string,
    fromOwner: string,
    toOwner: string
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

    if (txEvents.some((event) => event.type === "wasm-finalize-sale")) {
        await this.executeNftSale(dbTransaction, txEvents, tokenId, height);
    }


    await dbTransaction.insert(nftTransfer).values({
      fromOwner: dbNft.owner,
      toOwner: toOwner,
      transferredOnBlockHeight: height,
      nftId: dbNft.id
    });

    await dbTransaction
      .update(nft)
      .set({
        owner: toOwner
      })
      .where(and(eq(nft.id, dbNft.id)));
  }

  private async executeNftSale(dbTransaction: DbTransaction, txEvents: TransactionEventWithAttributes[], tokenId: number, height: number) {
    const collectionAddress = getEventAttributeValue(txEvents, "wasm-finalize-sale", "collection");
    const buyer = getEventAttributeValue(txEvents, "wasm-finalize-sale", "buyer");
    const payoutMarketPriceStr = getEventAttributeValue(txEvents, "wasm-payout-market", "coin");
    const payoutMarketPrice = payoutMarketPriceStr && parseCoins(payoutMarketPriceStr)[0];
    const royaltyPriceStr = getEventAttributeValue(txEvents, "wasm-payout-royalty", "coin");
    const royaltyPrice = royaltyPriceStr && parseCoins(royaltyPriceStr)[0];
    const royaltyRecipient = getEventAttributeValue(txEvents, "wasm-payout-royalty", "recipient");
    const payoutSellerPriceStr = getEventAttributeValue(txEvents, "wasm-payout-seller", "coin");
    const payoutSellerPrice = payoutSellerPriceStr && parseCoins(payoutSellerPriceStr)[0];

    if (!collectionAddress) throw new Error(`Collection not found for ${tokenId}}`);
    if (!buyer) throw new Error(`Buyer not found for ${tokenId} in collection ${collectionAddress}`);
    if (!royaltyRecipient) throw new Error(`Royalty recipient not found for ${tokenId} in collection ${collectionAddress}`);
    if (!payoutMarketPrice) throw new Error(`Market price not found for ${tokenId} in collection ${collectionAddress}`);
    if (!royaltyPrice) throw new Error(`Royalty price not found for ${tokenId} in collection ${collectionAddress}`);
    if (!payoutSellerPrice) throw new Error(`Seller price not found for ${tokenId} in collection ${collectionAddress}`);

    const [{ nft: dbNft }] = await dbTransaction
      .select()
      .from(nft)
      .innerJoin(collection, eq(collection.address, nft.collection))
      .where(
        and(isNotNull(nft.owner), eq(nft.tokenId, tokenId), or(eq(collection.address, collectionAddress), eq(collection.mintContract, collectionAddress)))
      );

    if (!dbNft) {
      throw new Error(`Nft not found for ${tokenId} in ${collectionAddress}`);
    }

    if (!dbNft.owner) throw new Error(`No owner for ${tokenId} in ${collectionAddress}`);

    // Add the sale
    await dbTransaction.insert(nftSale).values({
      previousOwner: dbNft.owner,
      newOwner: buyer,
      nft: dbNft.id,
      salePrice: payoutSellerPrice.amount,
      saleDenom: payoutSellerPrice.denom,
      saleBlockHeight: height,
      marketFee: payoutMarketPrice.amount,
      marketFeeDenom: payoutMarketPrice.denom,
      royaltyFee: royaltyPrice.amount,
      royaltyFeeDenom: royaltyPrice.denom,
      royaltyFeeAddress: royaltyRecipient
    });

    // Update the listing related to the token. Old owner listings are removed.
    await dbTransaction
        .update(nftListing)
        .set({
            unlistedBlockHeight: height
        })
        .where(and(eq(nftListing.nft, dbNft.id), eq(nftListing.owner, dbNft.owner),
            isNull(nftListing.unlistedBlockHeight)));

    // Removed bid if exists.
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

    // Update the owner and sale status
    await dbTransaction
      .update(nft)
      .set({
        activeListingId: null,
        owner: buyer
      })
      .where(eq(nft.id, dbNft.id));
  }

  private async insertNftTraits(dbTransaction: DbTransaction, dbNft: Nft, height: number, metadata: any) {
    const _metadata = NftMetadataSchema.safeParse(metadata);

    if (!_metadata.success) {
      throw new Error(`Invalid metadata for ${dbNft.id}`);
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

    for (const trait of data.attributes) {
      const existingTrait = await dbTransaction
        .select()
        .from(nftTrait)
        .innerJoin(collection, eq(nftTrait.collection, collection.address))
        .where(
          and(
            eq(collection.address, dbNft.collection as string),
            eq(nftTrait.traitType, trait.trait_type),
            eq(nftTrait.traitValue, trait.value),
            eq(nftTrait.displayType, trait.display_type)
          )
        );

      if (existingTrait.length > 0) {
        const dbNftToTrait = await dbTransaction
          .select()
          .from(nftToTrait)
          .where(and(eq(nftToTrait.nftId, dbNft.id), eq(nftToTrait.traitId, existingTrait[0].nft_trait.id)));

        if (dbNftToTrait.length > 0) {
          continue;
        }

        await dbTransaction.insert(nftToTrait).values({
          nftId: dbNft.id,
          traitId: existingTrait[0].nft_trait.id
        });
      } else {
        const [newTrait] = await dbTransaction
          .insert(nftTrait)
          .values({
            collection: dbNft.collection as string,
            displayType: trait.display_type,
            traitType: trait.trait_type,
            traitValue: trait.value
          })
          .returning({ id: nftTrait.id });

        await dbTransaction.insert(nftToTrait).values({
          nftId: dbNft.id,
          traitId: newTrait.id
        });
      }
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

    // TODO: There's no way to identify the whitelist to a collection, so we're just going to assume the symbol is in the label like so
    const symbol = label.split("WHITELIST:")[1]?.trim(); // WHITELIST: IDX
    const dbCollection = await dbTransaction.query.collection.findFirst({
      where: (collection, { or, eq }) => and(or(eq(collection.creator, admin), eq(collection.minter, admin)), eq(collection.symbol, symbol))
    });

    if (!dbCollection) {
      throw new Error(`Collection not found for admin ${admin}`);
    }

    const [insertedWhitelist] = await dbTransaction
      .insert(whitelist)
      .values({
        admin,
        address: whitelistAddress,
        collection: dbCollection.address,
        endTime: new Date(parseInt(whitelistInfo.end_time) / 1_000_000),
        startTime: new Date(parseInt(whitelistInfo.start_time) / 1_000_000),
        memberLimit: whitelistInfo.member_limit,
        numMembers: whitelistInfo.members.length,
        perAddressLimit: whitelistInfo.per_address_limit,
        unitPrice: parseInt(whitelistInfo.unit_price.amount)
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
