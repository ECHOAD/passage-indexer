import axios from "axios";
import { activeChain } from "@src/shared/constants";
import { Denom, DenomInsert, DbTransaction, denom, eq } from "database";
import { parseBech32 } from "@src/shared/utils/addresses";

const denomCache = new Map<string, Denom>();
const ibcTraceCache = new Map<string, { baseDenom?: string }>();

const cosmosDirectoryRest = activeChain.cosmosDirectoryId
  ? `https://rest.cosmos.directory/${activeChain.cosmosDirectoryId}`
  : null;

async function fetchIbcDenomTrace(hash: string): Promise<{ baseDenom?: string } | null> {
  if (!cosmosDirectoryRest) return null;
  const cached = ibcTraceCache.get(hash);
  if (cached) return cached;

  try {
    const response = await axios.get(
      `${cosmosDirectoryRest}/ibc/apps/transfer/v1/denom_traces/${hash}`,
      { timeout: 5000 }
    );
    const baseDenom = response.data?.denom_trace?.base_denom as string | undefined;
    const trace = { baseDenom };
    ibcTraceCache.set(hash, trace);
    return trace;
  } catch {
    ibcTraceCache.set(hash, {});
    return null;
  }
}

function guessDisplayDenom(base: string | undefined): string | undefined {
  if (!base) return undefined;
  if (base.startsWith("u") && base.length > 1) return base.slice(1);
  return base;
}

function buildDenomInsert(denomValue: string, trace?: { baseDenom?: string } | null): DenomInsert {
  const insert: DenomInsert = {
    denom: denomValue,
    decimals: 6,
    isNative: false,
    isIbc: false,
    isConvertible: false,
  };

  if (denomValue === activeChain.udenom) {
    insert.isNative = true;
    insert.displayDenom = activeChain.denom;
    insert.symbol = activeChain.denom?.toUpperCase?.() ?? activeChain.denom;
    insert.coingeckoId = activeChain.coinGeckoId ?? null;
    insert.isConvertible = Boolean(activeChain.coinGeckoId);
    return insert;
  }

  if (denomValue.startsWith("ibc/")) {
    insert.isIbc = true;
    insert.baseDenom = trace?.baseDenom ?? null;
    insert.displayDenom = guessDisplayDenom(trace?.baseDenom ?? undefined);
    return insert;
  }

  const bech = parseBech32(denomValue);
  if (bech) {
    // CW20 or other contract-based denom
    insert.displayDenom = null;
    return insert;
  }

  insert.displayDenom = guessDisplayDenom(denomValue);
  return insert;
}

function mergeDenom(existing: Denom, next: DenomInsert): Partial<DenomInsert> {
  const updates: Partial<DenomInsert> = {};

  if (!existing.displayDenom && next.displayDenom) updates.displayDenom = next.displayDenom;
  if (!existing.baseDenom && next.baseDenom) updates.baseDenom = next.baseDenom;
  if (existing.decimals === 6 && next.decimals && next.decimals !== 6) updates.decimals = next.decimals;
  if (!existing.symbol && next.symbol) updates.symbol = next.symbol;
  if (!existing.coingeckoId && next.coingeckoId) updates.coingeckoId = next.coingeckoId;
  if (!existing.isNative && next.isNative) updates.isNative = next.isNative;
  if (!existing.isIbc && next.isIbc) updates.isIbc = next.isIbc;
  if (!existing.isConvertible && next.isConvertible) updates.isConvertible = next.isConvertible;
  if (!existing.chainId && next.chainId) updates.chainId = next.chainId;

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date();
  }

  return updates;
}

export async function ensureDenom(
  dbTransaction: DbTransaction,
  denomValue: string | null | undefined
): Promise<Denom | null> {
  if (!denomValue) return null;

  const cached = denomCache.get(denomValue);
  if (cached) return cached;

  const existing = await dbTransaction.query.denom.findFirst({
    where: (table, { eq }) => eq(table.denom, denomValue),
  });

  let trace: { baseDenom?: string } | null = null;
  if (denomValue.startsWith("ibc/")) {
    const hash = denomValue.slice(4);
    trace = await fetchIbcDenomTrace(hash);
  }

  const insertData = buildDenomInsert(denomValue, trace);

  if (!existing) {
    await dbTransaction.insert(denom).values(insertData).onConflictDoNothing();
    const inserted = await dbTransaction.query.denom.findFirst({
      where: (table, { eq }) => eq(table.denom, denomValue),
    });
    if (inserted) {
      denomCache.set(denomValue, inserted);
      return inserted;
    }
  } else {
    const updates = mergeDenom(existing, insertData);
    if (Object.keys(updates).length > 0) {
      await dbTransaction.update(denom).set(updates).where(eq(denom.denom, denomValue));
      const refreshed = { ...existing, ...updates } as Denom;
      denomCache.set(denomValue, refreshed);
      return refreshed;
    }

    denomCache.set(denomValue, existing);
    return existing;
  }

  return null;
}

export async function ensureDenoms(
  dbTransaction: DbTransaction,
  denoms: Array<string | null | undefined>
): Promise<void> {
  for (const d of denoms) {
    await ensureDenom(dbTransaction, d);
  }
}
