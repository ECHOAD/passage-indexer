import { DecodedTxRaw } from "@cosmjs/proto-signing";
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
  collection,
} from "database";
import { getEventAttributeValue } from "@src/shared/utils/nftUtils";
import {
  VaultFactoryCreateVaultSchema,
  NftVaultInstantiateSchema,
  NftVaultStakeSchema,
  NftVaultUnstakeSchema,
  NftVaultClaimSchema,
  NftVaultClaimRewardsSchema,
  NftVaultCreateRewardAccountSchema,
  StakeRewardsInstantiateSchema,
  StakeRewardsStakeChangeSchema,
  StakeRewardsClaimRewardsSchema,
} from "@src/shared/zod/stakingSchema";
import z from "zod";

type ZodHandler<T> = { type: z.ZodType<T>; handler: (data: T) => Promise<void> | void };

function createZodHandler<T>(type: z.ZodType<T>, handler: (data: T) => Promise<void> | void): ZodHandler<T> {
  return { type, handler };
}

// Helper para obtener valores de eventos de staking
// Extiende getEventAttributeValue para soportar tipos de eventos de staking
function getStakingEventAttribute(
  events: TransactionEventWithAttributes[],
  eventType: string,
  attributeKey: string
): string | null {
  const event = events.find((e) => e.type === eventType);
  if (!event) return null;
  
  const attr = event.attributes.find((attr) => attr.key === attributeKey && attr.value);
  return attr?.value ?? null;
}

// Helper para obtener el address del contrato desde eventos wasm
function getContractAddressFromEvents(events: TransactionEventWithAttributes[]): string | null {
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

// Helper para obtener todos los eventos de un tipo
function getStakingEvents(events: TransactionEventWithAttributes[], eventType: string): TransactionEventWithAttributes[] {
  return events.filter((e) => e.type === eventType);
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
    const eventTypes = new Set(txEvents.map((e) => e.type));

    if (eventTypes.has("create-vault")) {
      return "vault_factory";
    }

    if (
      eventTypes.has("create-reward-account") ||
      eventTypes.has("claim-rewards") ||
      eventTypes.has("claim-unstaked")
    ) {
      return "nft_vault";
    }

    if (
      eventTypes.has("stake-change") ||
      eventTypes.has("update-rewards") ||
      eventTypes.has("update-user-rewards") ||
      eventTypes.has("set-config")
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

    // Detectar tipo de contrato
    const contractType = await this.identifyContractType(contractAddress, txEvents);

    // Verificar si es creación de vault desde factory
    const createVaultEvent = txEvents.find((e) => e.type === "create-vault");
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
    const createRewardAccountEvent = txEvents.find((e) => e.type === "create-reward-account");
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
    const setConfigEvent = txEvents.find((e) => e.type === "set-config");
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
          txEvents
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
    const factoryAddress = getContractAddressFromEvents(txEvents) || "";

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
    const setConfigEvent = txEvents.find((e) => e.type === "set-config");
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
    txEvents: TransactionEventWithAttributes[]
  ) {
    // Similar a handleRewardAccountCreation pero desde el contexto de instantiate
    // Este método se llama cuando detectamos un set-config de stake rewards
    // La creación real se maneja en handleRewardAccountCreation
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

    // Buscar eventos stake-change emitidos por Stake Rewards
    // Estos eventos se emiten después del stake cuando el vault llama a stake_change()
    const stakeChangeEvents = getStakingEvents(txEvents, "stake-change");

    // Extraer cantidades del primer evento stake-change encontrado
    let userStakedAmount = "0";
    let totalStakedAmount = "0";

    if (stakeChangeEvents.length > 0) {
      const firstStakeChange = stakeChangeEvents[0];
      userStakedAmount = getStakingEventAttribute([firstStakeChange], "stake-change", "amount") || "0";
      totalStakedAmount = getStakingEventAttribute([firstStakeChange], "stake-change", "total_staked") || "0";
    }

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

    // Buscar eventos stake-change para obtener cantidades actualizadas
    const stakeChangeEvents = getStakingEvents(txEvents, "stake-change");
    let userStakedAmount = "0";
    let totalStakedAmount = "0";

    if (stakeChangeEvents.length > 0) {
      const firstStakeChange = stakeChangeEvents[0];
      userStakedAmount = getStakingEventAttribute([firstStakeChange], "stake-change", "amount") || "0";
      totalStakedAmount = getStakingEventAttribute([firstStakeChange], "stake-change", "total_staked") || "0";
    }

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
    const claimEvent = txEvents.find((e) => e.type === "claim-unstaked");
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

    // El vault llama a múltiples reward accounts, cada uno emite eventos
    // Necesitamos agrupar eventos por reward account

    // Buscar todos los eventos update-rewards y update-user-rewards
    const updateRewardsEvents = getStakingEvents(txEvents, "update-rewards");
    const updateUserRewardsEvents = getStakingEvents(txEvents, "update-user-rewards");

    // Buscar transferencias de tokens (native o CW20)
    const transferEvents = txEvents.filter(
      (e) => e.type === "transfer" || e.type === "coin_received" || e.type === "coin_spent"
    );

    // Procesar cada reward account que emitió eventos
    // Asumimos que los eventos están en orden y corresponden a los mismos reward accounts
    for (let i = 0; i < updateRewardsEvents.length; i++) {
      const updateRewardsEvent = updateRewardsEvents[i];
      const updateUserRewardsEvent = updateUserRewardsEvents[i];

      if (!updateUserRewardsEvent) continue;

      // Buscar el address del contrato que emitió el evento
      // Los eventos update-rewards y update-user-rewards se emiten desde Stake Rewards
      // Necesitamos encontrar qué reward account los emitió
      // Esto es complejo porque múltiples reward accounts pueden emitir eventos
      // Por ahora, intentamos obtenerlo de los eventos wasm en el contexto del mensaje
      // Una mejor solución sería rastrear qué mensajes ejecutaron qué contratos
      const rewardAccountAddress = getContractAddressFromEvents(txEvents);

      if (!rewardAccountAddress) continue;

      // Extraer datos de recompensas
      const rewardsPerToken = getStakingEventAttribute([updateRewardsEvent], "update-rewards", "rewards_per_token");
      const pendingRewards = getStakingEventAttribute([updateUserRewardsEvent], "update-user-rewards", "pending_rewards");
      const stakedAmount = getStakingEventAttribute([updateUserRewardsEvent], "update-user-rewards", "staked_amount");
      const totalStaked = getStakingEventAttribute([updateRewardsEvent], "update-rewards", "total_staked");

      // Buscar transferencia correspondiente
      let rewardAmount = "0";
      let rewardDenom = "";

      // Buscar en transferencias (puede ser native o CW20)
      for (const transferEvent of transferEvents) {
        const recipient = getStakingEventAttribute([transferEvent], "transfer", "recipient");
        if (recipient === userAddress) {
          rewardAmount = getStakingEventAttribute([transferEvent], "transfer", "amount") || "0";
          rewardDenom = getStakingEventAttribute([transferEvent], "transfer", "denom") || "";
          break;
        }
      }

      // Si no encontramos transferencia, puede que no haya recompensas pendientes
      if (rewardAmount === "0") continue;

      // Obtener información del reward account
      const rewardAccount = await dbTransaction.query.stakeRewardAccount.findFirst({
        where: (account, { eq }) => eq(account.address, rewardAccountAddress),
      });

      if (!rewardAccount) continue;

      const transaction = await dbTransaction.query.transaction.findFirst({
        where: (tx, { eq }) => eq(tx.height, height),
      });

      // Insertar claim de recompensa
      const claimData: RewardClaimInsert = {
        rewardAccountAddress,
        vaultAddress,
        userAddress,
        claimedAtHeight: height,
        claimedAt: block.datetime,
        amount: rewardAmount,
        denom: rewardDenom || rewardAccount.rewardAssetDenom,
        stakedAmount: stakedAmount || "0",
        totalStaked: totalStaked || "0",
        rewardsPerToken: rewardsPerToken || "0",
      };

      await dbTransaction.insert(rewardClaim).values(claimData);

      // Insertar evento
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

