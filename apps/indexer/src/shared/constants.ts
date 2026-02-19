import { env } from "./utils/env";
import path from "path";

export const averageBlockTime = 6.174;
export const averageDaysInMonth = 30.437;
export const averageHoursInAMonth = averageDaysInMonth * 24;
export const averageBlockCountInAMonth = (averageDaysInMonth * 24 * 60 * 60) / averageBlockTime;
export const isProd = env.NODE_ENV === "production";

export enum ExecutionMode {
  DoNotSync,
  SyncOnly,
  RebuildStats,
  RebuildAll
}

export const executionMode: ExecutionMode = ExecutionMode.SyncOnly;
export const lastBlockToSync = Number.POSITIVE_INFINITY;

export interface ChainDef {
  code: string;
  rpcNodes: string[];
  cosmosDirectoryId: string;
  connectionString: string | undefined;
  genesisFileUrl?: string;
  coinGeckoId: string | null;
  logoUrlSVG?: string;
  logoUrlPNG?: string;
  bech32Prefix: string;
  denom: string;
  udenom: string;
  startHeight?: number;
}

export const activeChain: ChainDef = {
  code: "passage",
  rpcNodes: [
    "http://199.189.85.66:26695"
  ],
  cosmosDirectoryId: "passage",
  connectionString: process.env.PassageDatabaseCS,
  genesisFileUrl: "https://raw.githubusercontent.com/nodefleet/testnet-fleet/refs/heads/main/alphafleet-1/genesis.json",
  coinGeckoId: "passage",
  bech32Prefix: "pasg",
  denom: "pasg",
  udenom: "upasg",
  startHeight: 0
};

export const dataFolderPath = path.join(env.DataFolder, activeChain.code);
export const concurrentNodeQuery = 5;
