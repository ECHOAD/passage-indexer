import { DecodedTxRaw, parseCoins } from "@cosmjs/proto-signing";
import { Indexer } from "./indexer";
import { MsgExecuteContract, MsgInstantiateContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import {
  Block,
  BlockEventWithAttributes,
  DbTransaction,
  Message,
  Transaction,
  TransactionEventWithAttributes,
  and,
  eq,
  isNull,
  stakeVault,
  stakeRewardAccount,
  stakedNft,
  stakingEvent,
  rewardClaim,
  StakeVaultInsert,
  StakeRewardAccountInsert,
  StakedNftInsert,
  StakingEventInsert,
  RewardClaimInsert,
  nft,
  sql,
} from "database";
import { getEventAttributeValue } from "@src/shared/utils/nftUtils";
import { ensureDenom } from "@src/shared/utils/denom";
import {
  VaultFactoryCreateVaultSchema,
  NftVaultInstantiateSchema,
  NftVaultStakeSchema,
  NftVaultUnstakeSchema,
  NftVaultClaimSchema,
  NftVaultClaimRewardsSchema,
  NftVaultCreateRewardAccountSchema,
  StakeRewardsInstantiateSchema,
} from "@src/shared/zod/stakingSchema";
import z from "zod";

type ZodHandler<T> = { type: z.ZodType<T>; handler: (data: T) => Promise<void> | void };

function createZodHandler<T>(type: z.ZodType<T>, handler: (data: T) => Promise<void> | void): ZodHandler<T> {
  return { type, handler };
}

const WASM_EVENT_PREFIX = "wasm-";

// Some chains prefix custom wasm events with "wasm-".
function getStakingEventTypeCandidates(eventType: string): string[] {
  if (eventType === "wasm" || eventType === "instantiate" || eventType === "execute" || eventType === "message") {
    return [eventType];
  }

  if (eventType.startsWith(WASM_EVENT_PREFIX)) {
    return [eventType, eventType.slice(WASM_EVENT_PREFIX.length)];
  }

  return [eventType, `${WASM_EVENT_PREFIX}${eventType}`];
}

function findStakingEvent(
  events: TransactionEventWithAttributes[],
  eventType: string
): TransactionEventWithAttributes | undefined {
  const candidates = getStakingEventTypeCandidates(eventType);
  return events.find((e) => candidates.includes(e.type));
}

function hasStakingEventType(events: TransactionEventWithAttributes[], eventType: string): boolean {
  return Boolean(findStakingEvent(events, eventType));
}

// Helper para obtener valores de eventos de staking
// Extiende getEventAttributeValue para soportar tipos de eventos de staking
function getStakingEventAttribute(
  events: TransactionEventWithAttributes[],
  eventType: string,
  attributeKey: string
): string | null {
  const event = findStakingEvent(events, eventType);
  if (!event) return null;
  
  const attr = event.attributes.find((attr) => attr.key === attributeKey && attr.value);
  return attr?.value ?? null;
}

function getContractAddressFromEvents(events: TransactionEventWithAttributes[]): string | null {
  const executeEvent = findStakingEvent(events, "execute");
  if (executeEvent) {
    const contractAddr = getStakingEventAttribute([executeEvent], "execute", "_contract_address");
    if (contractAddr) return contractAddr;
  }

  // Buscar en eventos wasm
  const wasmEvent = events.find((e) => e.type === "wasm");
  if (wasmEvent) {
    const contractAddr = getStakingEventAttribute([wasmEvent], "wasm", "_contract_address");
    if (contractAddr) return contractAddr;
  }
  
  // Buscar en eventos instantiate
  const instantiateEvent = events.find((e) => e.type === "instantiate");
  if (instantiateEvent) {
    const contractAddr = getStakingEventAttribute([instantiateEvent], "instantiate", "_contract_address");
    if (contractAddr) return contractAddr;
  }
  
  return null;
}

function getContractAddressForMsgIndex(
  events: TransactionEventWithAttributes[],
  msgIndex: number | null | undefined
): string | null {
  if (msgIndex == null) return null;
  const scoped = events.filter((event) => event.msgIndex === msgIndex);
  for (const event of scoped) {
    const attr =
      event.attributes.find((a) => a.key === "_contract_address" && a.value) ||
      event.attributes.find((a) => a.key === "contract_address" && a.value);
    if (attr?.value) return attr.value;
  }
  return null;
}

function getStakingEvents(events: TransactionEventWithAttributes[], eventType: string): TransactionEventWithAttributes[] {
  const candidates = getStakingEventTypeCandidates(eventType);
  return events.filter((e) => candidates.includes(e.type));
}

export class StakingIndexer extends Indexer {
  // Direcciones conocidas de contratos (se pueden configurar por env o detectar automáticamente)
  private vaultFactoryAddresses: Set<string> = new Set();
  private knownVaultAddresses: Map<string, string> = new Map(); // vaultAddress -> factoryAddress
  private knownRewardAccountAddresses: Map<string, string> = new Map(); // rewardAccountAddress -> vaultAddress

  constructor() {
    super();
    this.name = "StakingIndexer";
    this.msgHandlers = {
      "/cosmwasm.wasm.v1.MsgInstantiateContract": this.handleInstantiateContract,
      "/cosmwasm.wasm.v1.MsgExecuteContract": this.handleExecuteContract,
    };
  }

  private async computeStakeAmounts(
    dbTransaction: DbTransaction,
    vaultAddress: string,
    stakerAddress: string
  ): Promise<{ userStakedAmount: string; totalStakedAmount: string }> {
    const vault = await dbTransaction.query.stakeVault.findFirst({
      where: (vault, { eq }) => eq(vault.address, vaultAddress),
    });

    if (!vault || !vault.collections || vault.collections.length === 0) {
      return { userStakedAmount: "0", totalStakedAmount: "0" };
    }

    const collections = vault.collections as string[];

    const userRows = await dbTransaction
      .select({
        collection: stakedNft.collectionAddress,
        count: sql<number>`COUNT(*)`,
      })
      .from(stakedNft)
      .where(
        and(
          eq(stakedNft.vaultAddress, vaultAddress),
          eq(stakedNft.stakerAddress, stakerAddress),
          isNull(stakedNft.unstakedAtHeight)
        )
      )
      .groupBy(stakedNft.collectionAddress);

    const userCountMap = new Map<string, number>();
    for (const row of userRows) {
      userCountMap.set(row.collection, Number(row.count ?? 0));
    }

    const userStakedAmount = Math.min(
      ...collections.map((c) => userCountMap.get(c) ?? 0)
    );

    const allRows = await dbTransaction
      .select({
        staker: stakedNft.stakerAddress,
        collection: stakedNft.collectionAddress,
        count: sql<number>`COUNT(*)`,
      })
      .from(stakedNft)
      .where(
        and(eq(stakedNft.vaultAddress, vaultAddress), isNull(stakedNft.unstakedAtHeight))
      )
      .groupBy(stakedNft.stakerAddress, stakedNft.collectionAddress);

    const stakerMap = new Map<string, Map<string, number>>();
    for (const row of allRows) {
      const entry = stakerMap.get(row.staker) ?? new Map<string, number>();
      entry.set(row.collection, Number(row.count ?? 0));
      stakerMap.set(row.staker, entry);
    }

    let totalStakedAmount = 0;
    for (const [, counts] of stakerMap.entries()) {
      const minPerStaker = Math.min(
        ...collections.map((c) => counts.get(c) ?? 0)
      );
      totalStakedAmount += minPerStaker;
    }

    return {
      userStakedAmount: userStakedAmount.toString(),
      totalStakedAmount: totalStakedAmount.toString(),
    };
  }

  // Identificar tipo de contrato por address o eventos
  private async identifyContractType(
    contractAddress: string,
    txEvents: TransactionEventWithAttributes[]
  ): Promise<"vault_factory" | "nft_vault" | "stake_rewards" | null> {
    // Verificar si es un vault factory conocido
    if (this.vaultFactoryAddresses.has(contractAddress)) {
      return "vault_factory";
    }

    // Verificar si es un vault conocido
    if (this.knownVaultAddresses.has(contractAddress)) {
      return "nft_vault";
    }

    // Verificar si es un reward account conocido
    if (this.knownRewardAccountAddresses.has(contractAddress)) {
      return "stake_rewards";
    }

    // Detectar por eventos
    if (hasStakingEventType(txEvents, "create-vault")) {
      return "vault_factory";
    }

    if (
      hasStakingEventType(txEvents, "create-reward-account") ||
      hasStakingEventType(txEvents, "claim-rewards") ||
      hasStakingEventType(txEvents, "claim-unstaked")
    ) {
      return "nft_vault";
    }

    if (
      hasStakingEventType(txEvents, "stake-change") ||
      hasStakingEventType(txEvents, "update-rewards") ||
      hasStakingEventType(txEvents, "update-user-rewards") ||
      hasStakingEventType(txEvents, "set-config")
    ) {
      return "stake_rewards";
    }

    return null;
  }

  private async handleInstantiateContract(
    decodedMessage: MsgInstantiateContract,
    height: number,
    dbTransaction: DbTransaction,
    msg: Message,
    txEvents: TransactionEventWithAttributes[]
  ) {
    const contractAddress = getEventAttributeValue(txEvents, "instantiate", "_contract_address");
    if (!contractAddress) return;

    const buffer = Buffer.from(decodedMessage.msg);
    const stringBuffer = buffer.toString().replace(/\\n/g, "");
    let jsonData: any;
    try {
      jsonData = JSON.parse(stringBuffer);
    } catch (e) {
      return; // No es JSON válido, no es un contrato de staking
    }

    const vaultInstantiateResult = NftVaultInstantiateSchema.safeParse(jsonData);
    if (vaultInstantiateResult.success) {
      await this.handleVaultCreation(
        contractAddress,
        decodedMessage.admin || decodedMessage.sender,
        vaultInstantiateResult.data,
        height,
        dbTransaction,
        txEvents
      );
      return;
    }

    const stakeRewardsInstantiateResult = StakeRewardsInstantiateSchema.safeParse(jsonData);
    if (stakeRewardsInstantiateResult.success) {
      await this.handleStakeRewardsInstantiate(
        contractAddress,
        stakeRewardsInstantiateResult.data.stake,
        stakeRewardsInstantiateResult.data,
        height,
        dbTransaction,
        decodedMessage
      );
      return;
    }

    // Detectar tipo de contrato
    const contractType = await this.identifyContractType(contractAddress, txEvents);

    // Verificar si es creación de vault desde factory
    const createVaultEvent = findStakingEvent(txEvents, "create-vault");
    if (createVaultEvent) {
      const vaultAddress = getStakingEventAttribute([createVaultEvent], "create-vault", "address");
      if (vaultAddress) {
        await this.handleVaultCreation(
          vaultAddress,
          decodedMessage.admin || "",
          jsonData,
          height,
          dbTransaction,
          txEvents
        );
        return;
      }
    }

    // Verificar si es creación de reward account desde vault
    const createRewardAccountEvent = findStakingEvent(txEvents, "create-reward-account");
    if (createRewardAccountEvent) {
      const rewardAccountAddress = getStakingEventAttribute([createRewardAccountEvent], "create-reward-account", "address");
      if (rewardAccountAddress) {
        // El vault address se obtiene del contexto (quien instanció)
        // Necesitamos buscar en la transacción o en eventos anteriores
        await this.handleRewardAccountCreation(
          rewardAccountAddress,
          contractAddress, // El vault que creó el reward account
          jsonData,
          height,
          dbTransaction,
          txEvents,
          decodedMessage
        );
        return;
      }
    }

    // Verificar si es creación de Stake Rewards
    const setConfigEvent = findStakingEvent(txEvents, "set-config");
    if (setConfigEvent && contractType === "stake_rewards") {
      const stakeAddress = getStakingEventAttribute([setConfigEvent], "set-config", "stake");
      if (stakeAddress) {
        // Es un reward account, el vault address es el "stake"
        this.knownRewardAccountAddresses.set(contractAddress, stakeAddress);
        await this.handleStakeRewardsInstantiate(
          contractAddress,
          stakeAddress,
          jsonData,
          height,
          dbTransaction,
          decodedMessage
        );
        return;
      }
    }
  }

  private async handleExecuteContract(
    decodedMessage: MsgExecuteContract,
    height: number,
    dbTransaction: DbTransaction,
    msg: Message,
    txEvents: TransactionEventWithAttributes[]
  ) {
    const contractAddress = decodedMessage.contract;
    const buffer = Buffer.from(decodedMessage.msg);
    const stringBuffer = buffer.toString().replace(/\\n/g, "");
    let jsonData: any;
    try {
      jsonData = JSON.parse(stringBuffer);
    } catch (e) {
      return; // No es JSON válido
    }

    const contractType = await this.identifyContractType(contractAddress, txEvents);

    if (contractType === "vault_factory") {
      // Ejecuciones del factory (crear vaults)
      const createVaultResult = VaultFactoryCreateVaultSchema.safeParse(jsonData);
      if (createVaultResult.success) {
        const vaultAddress = getStakingEventAttribute(txEvents, "create-vault", "address");
        if (vaultAddress) {
          await this.handleVaultCreation(
            vaultAddress,
            decodedMessage.sender,
            createVaultResult.data.create_vault,
            height,
            dbTransaction,
            txEvents
          );
        }
      }
    } else if (contractType === "nft_vault") {
      // Ejecuciones del vault
      const handlers: ZodHandler<any>[] = [
        createZodHandler(NftVaultStakeSchema, (stakeTx) =>
          this.handleStake(decodedMessage, height, dbTransaction, txEvents, stakeTx.stake)
        ),
        createZodHandler(NftVaultUnstakeSchema, (unstakeTx) =>
          this.handleUnstake(decodedMessage, height, dbTransaction, txEvents, unstakeTx.unstake)
        ),
        createZodHandler(NftVaultClaimSchema, () => this.handleClaim(decodedMessage, height, dbTransaction, txEvents)),
        createZodHandler(NftVaultClaimRewardsSchema, () =>
          this.handleClaimRewards(decodedMessage, height, dbTransaction, txEvents)
        ),
        createZodHandler(NftVaultCreateRewardAccountSchema, (createRewardTx) =>
          this.handleCreateRewardAccount(
            decodedMessage,
            height,
            dbTransaction,
            txEvents,
            createRewardTx.create_reward_account
          )
        ),
      ];

      const matchingHandler = handlers.find((handler) => handler.type.safeParse(jsonData).success);
      if (matchingHandler) {
        await matchingHandler.handler(matchingHandler.type.safeParse(jsonData).data);
      }
    } else if (contractType === "stake_rewards") {
      // Los mensajes de Stake Rewards se llaman internamente desde el vault
      // Pero podemos indexar los eventos que emiten
      // No necesitamos procesar los mensajes directamente aquí
      // Los eventos se procesan en handleStake, handleUnstake, handleClaimRewards
    }
  }

  // Handler para creación de vault
  private async handleVaultCreation(
    vaultAddress: string,
    admin: string,
    initMsg: any,
    height: number,
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[]
  ) {
    // Verificar si ya existe
    const existing = await dbTransaction.query.stakeVault.findFirst({
      where: (vault, { eq }) => eq(vault.address, vaultAddress),
    });
    if (existing) return; // Ya existe

    const block = await dbTransaction.query.block.findFirst({
      where: (block, { eq }) => eq(block.height, height),
    });
    if (!block) throw new Error(`Block ${height} not found`);

    // Obtener factory address del evento o del contexto
    // El factory es quien ejecutó el mensaje de instantiate
    const factoryAddress =
      getStakingEventAttribute(txEvents, "create-vault", "_contract_address") ||
      getStakingEventAttribute(txEvents, "execute", "_contract_address") ||
      "";

    // Parsear configuración
    let collections: string[] = [];
    let unstakingDurationSec = 0;

    if (initMsg.config) {
      collections = initMsg.config.collections || [];
      unstakingDurationSec = initMsg.config.unstaking_duration_sec || 0;
    } else if (initMsg.collections) {
      // Formato alternativo
      collections = initMsg.collections;
      unstakingDurationSec = initMsg.unstaking_duration_sec || 0;
    }

    const vaultData: StakeVaultInsert = {
      address: vaultAddress,
      factoryAddress,
      createdHeight: height,
      createdBy: admin,
      unstakingDurationSec,
      collections,
      createdAt: block.datetime,
    };

    await dbTransaction.insert(stakeVault).values(vaultData);
    this.knownVaultAddresses.set(vaultAddress, factoryAddress);
    if (factoryAddress) {
      this.vaultFactoryAddresses.add(factoryAddress);
    }
  }

  // Handler para creación de reward account
  private async handleRewardAccountCreation(
    rewardAccountAddress: string,
    vaultAddress: string,
    initMsg: any,
    height: number,
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    decodedMessage: MsgInstantiateContract
  ) {
    // Verificar si ya existe
    const existing = await dbTransaction.query.stakeRewardAccount.findFirst({
      where: (account, { eq }) => eq(account.address, rewardAccountAddress),
    });
    if (existing) return;

    const block = await dbTransaction.query.block.findFirst({
      where: (block, { eq }) => eq(block.height, height),
    });
    if (!block) throw new Error(`Block ${height} not found`);

    // Obtener configuración del evento set-config
    const setConfigEvent = findStakingEvent(txEvents, "set-config");
    if (!setConfigEvent) return;

    const rewardAssetStr = getStakingEventAttribute([setConfigEvent], "set-config", "reward_asset");
    const periodStartStr = getStakingEventAttribute([setConfigEvent], "set-config", "period_start");
    const durationSecStr = getStakingEventAttribute([setConfigEvent], "set-config", "duration_sec");

    if (!rewardAssetStr || !periodStartStr || !durationSecStr) return;

    // Parsear reward asset
    let rewardAssetType: "native" | "cw20" = "native";
    let rewardAssetDenom = "";

    try {
      const rewardAsset = JSON.parse(rewardAssetStr);
      if (rewardAsset.native) {
        rewardAssetType = "native";
        rewardAssetDenom = rewardAsset.native;
      } else if (rewardAsset.cw20) {
        rewardAssetType = "cw20";
        rewardAssetDenom = rewardAsset.cw20;
      }
    } catch {
      // Intentar parsear directamente
      if (rewardAssetStr.includes("native")) {
        rewardAssetType = "native";
        rewardAssetDenom = rewardAssetStr.replace(/[{}"]/g, "").split(":")[1] || rewardAssetStr;
      } else {
        rewardAssetType = "cw20";
        rewardAssetDenom = rewardAssetStr;
      }
    }

    const periodStart = new Date(parseInt(periodStartStr) / 1_000_000);
    const durationSec = parseInt(durationSecStr);
    const periodEnd = new Date(periodStart.getTime() + durationSec * 1000);

    await ensureDenom(dbTransaction, rewardAssetDenom);

    // Obtener fondos iniciales
    const funds = decodedMessage.funds?.[0];
    const totalFunds = funds ? funds.amount : "0";

    const rewardAccountData: StakeRewardAccountInsert = {
      address: rewardAccountAddress,
      vaultAddress,
      rewardAssetType,
      rewardAssetDenom,
      periodStart,
      durationSec,
      periodEnd,
      totalFunds,
      remainingFunds: totalFunds,
    };

    await dbTransaction.insert(stakeRewardAccount).values(rewardAccountData);
    this.knownRewardAccountAddresses.set(rewardAccountAddress, vaultAddress);
  }

  // Handler para instantiate de Stake Rewards
  private async handleStakeRewardsInstantiate(
    rewardAccountAddress: string,
    vaultAddress: string,
    initMsg: any,
    height: number,
    dbTransaction: DbTransaction,
    decodedMessage: MsgInstantiateContract
  ) {
    const existing = await dbTransaction.query.stakeRewardAccount.findFirst({
      where: (account, { eq }) => eq(account.address, rewardAccountAddress),
    });
    if (existing) return;

    const vault = await dbTransaction.query.stakeVault.findFirst({
      where: (vault, { eq }) => eq(vault.address, vaultAddress),
    });
    if (!vault) return;

    const block = await dbTransaction.query.block.findFirst({
      where: (block, { eq }) => eq(block.height, height),
    });
    if (!block) throw new Error(`Block ${height} not found`);

    const rewardAsset = initMsg.reward_asset;
    if (!rewardAsset) return;

    const isNative = rewardAsset.native !== undefined;
    const assetType = isNative ? "native" : "cw20";
    const assetDenom = isNative ? rewardAsset.native : rewardAsset.cw20;

    const periodStartRaw = initMsg.period_start;
    if (periodStartRaw == null) return;

    const periodStart = new Date(parseInt(periodStartRaw) / 1_000_000);
    const durationSec = parseInt(initMsg.duration_sec);
    const periodEnd = new Date(periodStart.getTime() + durationSec * 1000);

    const funds = decodedMessage.funds?.[0];
    const totalFunds = funds ? funds.amount : "0";

    await ensureDenom(dbTransaction, assetDenom);

    const rewardAccountData: StakeRewardAccountInsert = {
      address: rewardAccountAddress,
      vaultAddress,
      rewardAssetType: assetType,
      rewardAssetDenom: assetDenom,
      periodStart,
      durationSec,
      periodEnd,
      totalFunds,
      remainingFunds: totalFunds,
    };

    await dbTransaction.insert(stakeRewardAccount).values(rewardAccountData);
    this.knownRewardAccountAddresses.set(rewardAccountAddress, vaultAddress);
  }

  // Handler para stake
  private async handleStake(
    decodedMessage: MsgExecuteContract,
    height: number,
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    stakeMsg: any
  ) {
    const vaultAddress = decodedMessage.contract;
    const stakerAddress = decodedMessage.sender;
    const block = await dbTransaction.query.block.findFirst({
      where: (block, { eq }) => eq(block.height, height),
    });
    if (!block) throw new Error(`Block ${height} not found`);

    // Extraer NFTs del mensaje
    const nfts = stakeMsg.nfts || [];
    const nftCount = nfts.length;

    if (nftCount === 0) return;

    // stake-change events are emitted by the rewards contract, but are unreliable for
    // multi-collection vaults. We compute stake amounts from indexed NFTs instead.

    // Insertar cada NFT stakeado
    for (const nft of nfts) {
      const collectionAddress = nft.collection;
      const tokenId = nft.token_id;

      // Buscar el NFT en la base de datos
      const dbNft = await dbTransaction.query.nft.findFirst({
        where: (nft, { and, eq }) => and(eq(nft.collection, collectionAddress), eq(nft.tokenId, parseInt(tokenId) || 0)),
      });

      const stakedNftData: StakedNftInsert = {
        vaultAddress,
        collectionAddress,
        tokenId,
        stakerAddress,
        stakedAtHeight: height,
        stakedAt: block.datetime,
        nftId: dbNft?.id || null,
      };

      await dbTransaction.insert(stakedNft).values(stakedNftData);
    }

    const { userStakedAmount, totalStakedAmount } = await this.computeStakeAmounts(
      dbTransaction,
      vaultAddress,
      stakerAddress
    );

    // Insertar evento
    const transaction = await dbTransaction.query.transaction.findFirst({
      where: (tx, { eq }) => eq(tx.height, height),
    });

    const eventData: StakingEventInsert = {
      vaultAddress,
      eventType: "stake",
      userAddress: stakerAddress,
      height,
      transactionHash: transaction?.hash || "",
      transactionId: transaction?.id || undefined,
      blockTime: block.datetime,
      nftCount,
      metadata: {
        user_staked_amount: userStakedAmount,
        total_staked_amount: totalStakedAmount,
      },
    };

    await dbTransaction.insert(stakingEvent).values(eventData);
  }

  // Handler para unstake
  private async handleUnstake(
    decodedMessage: MsgExecuteContract,
    height: number,
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    unstakeMsg: any
  ) {
    const vaultAddress = decodedMessage.contract;
    const stakerAddress = decodedMessage.sender;
    const block = await dbTransaction.query.block.findFirst({
      where: (block, { eq }) => eq(block.height, height),
    });
    if (!block) throw new Error(`Block ${height} not found`);

    const nfts = unstakeMsg.nfts || [];
    const nftCount = nfts.length;

    if (nftCount === 0) return;

    // Obtener configuración del vault para calcular claimableAt
    const vault = await dbTransaction.query.stakeVault.findFirst({
      where: (vault, { eq }) => eq(vault.address, vaultAddress),
    });
    if (!vault) throw new Error(`Vault ${vaultAddress} not found`);

    const claimableAt = new Date(block.datetime.getTime() + Number(vault.unstakingDurationSec) * 1000);

    // Marcar NFTs como unstakeados
    for (const nft of nfts) {
      const collectionAddress = nft.collection;
      const tokenId = nft.token_id;

      await dbTransaction
        .update(stakedNft)
        .set({
          unstakedAtHeight: height,
          unstakedAt: block.datetime,
          claimableAt,
        })
        .where(
          and(
            eq(stakedNft.vaultAddress, vaultAddress),
            eq(stakedNft.collectionAddress, collectionAddress),
            eq(stakedNft.tokenId, tokenId),
            eq(stakedNft.stakerAddress, stakerAddress),
            isNull(stakedNft.unstakedAtHeight)
          )
        );
    }

    const { userStakedAmount, totalStakedAmount } = await this.computeStakeAmounts(
      dbTransaction,
      vaultAddress,
      stakerAddress
    );

    // Insertar evento
    const transaction = await dbTransaction.query.transaction.findFirst({
      where: (tx, { eq }) => eq(tx.height, height),
    });

    const eventData: StakingEventInsert = {
      vaultAddress,
      eventType: "unstake",
      userAddress: stakerAddress,
      height,
      transactionHash: transaction?.hash || "",
      transactionId: transaction?.id || undefined,
      blockTime: block.datetime,
      nftCount,
      metadata: {
        user_staked_amount: userStakedAmount,
        total_staked_amount: totalStakedAmount,
      },
    };

    await dbTransaction.insert(stakingEvent).values(eventData);
  }

  // Handler para claim de NFTs unstakeados
  private async handleClaim(
    decodedMessage: MsgExecuteContract,
    height: number,
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[]
  ) {
    const vaultAddress = decodedMessage.contract;
    const userAddress = decodedMessage.sender;
    const block = await dbTransaction.query.block.findFirst({
      where: (block, { eq }) => eq(block.height, height),
    });
    if (!block) throw new Error(`Block ${height} not found`);

    // Buscar evento claim-unstaked
    const claimEvent = findStakingEvent(txEvents, "claim-unstaked");
    if (!claimEvent) return; // No es un claim

    // Extraer NFTs del evento (formato: "collection1-tokenId1,collection2-tokenId2")
    const nftsString = getStakingEventAttribute([claimEvent], "claim-unstaked", "nfts");
    if (!nftsString) return;

    // Parsear NFTs
    const nftStrings = nftsString.split(",");
    const nfts: Array<{ collection: string; tokenId: string }> = [];

    for (const nftStr of nftStrings) {
      const parts = nftStr.trim().split("-");
      if (parts.length >= 2) {
        const tokenId = parts.slice(1).join("-"); // Por si el tokenId tiene guiones
        nfts.push({ collection: parts[0].trim(), tokenId: tokenId.trim() });
      }
    }

    // Marcar NFTs como claimados
    for (const nft of nfts) {
      await dbTransaction
        .update(stakedNft)
        .set({ isClaimed: true })
        .where(
          and(
            eq(stakedNft.vaultAddress, vaultAddress),
            eq(stakedNft.collectionAddress, nft.collection),
            eq(stakedNft.tokenId, nft.tokenId),
            eq(stakedNft.stakerAddress, userAddress)
          )
        );
    }

    // Insertar evento
    const transaction = await dbTransaction.query.transaction.findFirst({
      where: (tx, { eq }) => eq(tx.height, height),
    });

    const eventData: StakingEventInsert = {
      vaultAddress,
      eventType: "claim",
      userAddress,
      height,
      transactionHash: transaction?.hash || "",
      transactionId: transaction?.id || undefined,
      blockTime: block.datetime,
      nftCount: nfts.length,
    };

    await dbTransaction.insert(stakingEvent).values(eventData);
  }

  // Handler para creación de reward account desde mensaje execute
  private async handleCreateRewardAccount(
    decodedMessage: MsgExecuteContract,
    height: number,
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[],
    createRewardAccountMsg: any
  ) {
    const vaultAddress = decodedMessage.contract;
    const rewardAccountAddress = getStakingEventAttribute(txEvents, "create-reward-account", "address");

    if (!rewardAccountAddress) return;

    const block = await dbTransaction.query.block.findFirst({
      where: (block, { eq }) => eq(block.height, height),
    });
    if (!block) throw new Error(`Block ${height} not found`);

    const rewardAsset = createRewardAccountMsg.reward_asset;
    const isNative = rewardAsset.native !== undefined;
    const assetType = isNative ? "native" : "cw20";
    const assetDenom = isNative ? rewardAsset.native : rewardAsset.cw20;

    const periodStart = new Date(parseInt(createRewardAccountMsg.period_start) / 1_000_000);
    const durationSec = parseInt(createRewardAccountMsg.duration_sec);
    const periodEnd = new Date(periodStart.getTime() + durationSec * 1000);

    // Obtener fondos iniciales
    const funds = decodedMessage.funds?.[0];
    const totalFunds = funds ? funds.amount : "0";

    // Verificar si ya existe
    const existing = await dbTransaction.query.stakeRewardAccount.findFirst({
      where: (account, { eq }) => eq(account.address, rewardAccountAddress),
    });
    if (existing) return;

    const rewardAccountData: StakeRewardAccountInsert = {
      address: rewardAccountAddress,
      vaultAddress,
      rewardAssetType: assetType,
      rewardAssetDenom: assetDenom,
      periodStart,
      durationSec,
      periodEnd,
      totalFunds,
      remainingFunds: totalFunds,
    };

    await dbTransaction.insert(stakeRewardAccount).values(rewardAccountData);
    this.knownRewardAccountAddresses.set(rewardAccountAddress, vaultAddress);

    // Insertar evento
    const transaction = await dbTransaction.query.transaction.findFirst({
      where: (tx, { eq }) => eq(tx.height, height),
    });

    const eventData: StakingEventInsert = {
      vaultAddress,
      eventType: "create_reward_account",
      userAddress: decodedMessage.sender,
      height,
      transactionHash: transaction?.hash || "",
      transactionId: transaction?.id || undefined,
      blockTime: block.datetime,
      rewardAccountAddress,
    };

    await dbTransaction.insert(stakingEvent).values(eventData);
  }

  // Handler para claim de recompensas
  private async handleClaimRewards(
    decodedMessage: MsgExecuteContract,
    height: number,
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[]
  ) {
    const vaultAddress = decodedMessage.contract;
    const userAddress = decodedMessage.sender;
    const block = await dbTransaction.query.block.findFirst({
      where: (block, { eq }) => eq(block.height, height),
    });
    if (!block) throw new Error(`Block ${height} not found`);

    const updateRewardsEvents = getStakingEvents(txEvents, "update-rewards");
    const updateUserRewardsEvents = getStakingEvents(txEvents, "update-user-rewards");

    const updateRewardsByMsgIndex = new Map<number, TransactionEventWithAttributes>();
    for (const event of updateRewardsEvents) {
      if (event.msgIndex != null && !updateRewardsByMsgIndex.has(event.msgIndex)) {
        updateRewardsByMsgIndex.set(event.msgIndex, event);
      }
    }

    const transferEvents = txEvents.filter(
      (e) =>
        e.type === "transfer" ||
        e.type === "wasm-transfer" ||
        e.type === "coin_received" ||
        e.type === "coin_spent" ||
        e.type === "wasm"
    );

    for (const updateUserRewardsEvent of updateUserRewardsEvents) {
      const msgIndex = updateUserRewardsEvent.msgIndex ?? null;
      const updateRewardsEvent =
        (msgIndex != null ? updateRewardsByMsgIndex.get(msgIndex) : undefined) || updateRewardsEvents[0];

      const rewardAccountAddress =
        getContractAddressForMsgIndex(txEvents, msgIndex) ||
        (updateRewardsEvent
          ? getStakingEventAttribute([updateRewardsEvent], "update-rewards", "_contract_address")
          : null) ||
        getStakingEventAttribute([updateUserRewardsEvent], "update-user-rewards", "_contract_address") ||
        getStakingEventAttribute(txEvents, "execute", "_contract_address") ||
        getContractAddressFromEvents(txEvents);

      if (!rewardAccountAddress) continue;

      const rewardsPerToken = updateRewardsEvent
        ? getStakingEventAttribute([updateRewardsEvent], "update-rewards", "rewards_per_token")
        : null;
      const claimedRewardsStr = getStakingEventAttribute(
        [updateUserRewardsEvent],
        "update-user-rewards",
        "claimed_rewards"
      );

      const { userStakedAmount, totalStakedAmount } = await this.computeStakeAmounts(
        dbTransaction,
        vaultAddress,
        userAddress
      );

      let rewardAmount = "0";
      if (claimedRewardsStr) {
        try {
          const [sumRow] = await dbTransaction
            .select({ total: sql<string>`COALESCE(SUM(${rewardClaim.amount}), 0)` })
            .from(rewardClaim)
            .where(
              and(eq(rewardClaim.rewardAccountAddress, rewardAccountAddress), eq(rewardClaim.userAddress, userAddress))
            );
          const prevTotal = BigInt(sumRow?.total ?? "0");
          const currentTotal = BigInt(claimedRewardsStr);
          const delta = currentTotal > prevTotal ? currentTotal - prevTotal : BigInt(0);
          rewardAmount = delta.toString();
        } catch {
          rewardAmount = "0";
        }
      }

      let rewardDenom = "";

      if (rewardAmount === "0") {
        for (const transferEvent of transferEvents) {
          const recipient =
            transferEvent.attributes.find((attr) => attr.key === "recipient")?.value ||
            transferEvent.attributes.find((attr) => attr.key === "receiver")?.value ||
            transferEvent.attributes.find((attr) => attr.key === "to")?.value ||
            "";
          if (recipient !== userAddress) continue;

          const amountRaw = transferEvent.attributes.find((attr) => attr.key === "amount")?.value;
          const denomRaw = transferEvent.attributes.find((attr) => attr.key === "denom")?.value;

          if (amountRaw) {
            try {
              const parsed = parseCoins(amountRaw);
              if (parsed.length > 0) {
                rewardAmount = parsed[0].amount;
                rewardDenom = parsed[0].denom;
              } else {
                rewardAmount = amountRaw;
              }
            } catch {
              const match = amountRaw.match(/^(\d+)([a-zA-Z/][\w/.-]*)$/);
              if (match) {
                rewardAmount = match[1];
                rewardDenom = match[2];
              } else {
                rewardAmount = amountRaw;
              }
            }
          } else if (denomRaw) {
            rewardAmount = "0";
            rewardDenom = denomRaw;
          }

          if (rewardAmount !== "0") break;
        }
      }

      if (rewardAmount === "0") continue;

      const rewardAccount = await dbTransaction.query.stakeRewardAccount.findFirst({
        where: (account, { eq }) => eq(account.address, rewardAccountAddress),
      });

      if (!rewardAccount) continue;

      const transaction = await dbTransaction.query.transaction.findFirst({
        where: (tx, { eq }) => eq(tx.height, height),
      });

      await ensureDenom(dbTransaction, rewardDenom || rewardAccount.rewardAssetDenom);

      const claimData: RewardClaimInsert = {
        rewardAccountAddress,
        vaultAddress,
        userAddress,
        claimedAtHeight: height,
        claimedAt: block.datetime,
        amount: rewardAmount,
        denom: rewardDenom || rewardAccount.rewardAssetDenom,
        stakedAmount: userStakedAmount,
        totalStaked: totalStakedAmount,
        rewardsPerToken: rewardsPerToken || "0",
      };

      await dbTransaction.insert(rewardClaim).values(claimData);

      const eventData: StakingEventInsert = {
        vaultAddress,
        eventType: "claim_rewards",
        userAddress,
        height,
        transactionHash: transaction?.hash || "",
        transactionId: transaction?.id || undefined,
        blockTime: block.datetime,
        rewardAccountAddress,
        rewardAmount,
        rewardDenom: rewardDenom || rewardAccount.rewardAssetDenom,
      };

      await dbTransaction.insert(stakingEvent).values(eventData);
    }
  }

  public async afterEveryBlock(
    currentBlock: Block,
    previousBlock: Block | undefined,
    events: BlockEventWithAttributes[],
    dbTransaction: DbTransaction
  ): Promise<void> {
    return Promise.resolve();
  }

  public async afterEveryTransaction(
    rawTx: DecodedTxRaw,
    currentTransaction: Transaction,
    dbTransaction: DbTransaction,
    txEvents: TransactionEventWithAttributes[]
  ): Promise<void> {
    return Promise.resolve();
  }
}

