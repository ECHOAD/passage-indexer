import {
  block, day, db, eq, collection, nft, notInArray, nftListing, nftSale,
  and, lte, min, sql, sum, count, countDistinct, gte, nftToTrait, nftTrait,
  isNull, asc, gt, isNotNull, or, aliasedTable as alias
} from "database";
import { TraitStats, GetTraitsOptions } from "@src/types/collection";
import { udenomToDenom } from "@src/utils/math";
import { getLastProcessedISODate } from "./block.service";
import { mapCollection } from "@src/utils/collection.util";
import { IGNORED_COLLECTIONS } from "@src/utils/constants";

type MappedCollectionType = Awaited<ReturnType<typeof mapCollection>>;

type Period = "24h" | "7d" | "30d";

const sortOptions: Record<string, (a: MappedCollectionType & PeriodStats, b: MappedCollectionType & PeriodStats) => number> = {
  createdHeightAsc: (a, b) => a.createdHeight - b.createdHeight,
  createdHeightDesc: (a, b) => b.createdHeight - a.createdHeight,
  nftCountAsc: (a, b) => a.nftCount - b.nftCount,
  nftCountDesc: (a, b) => b.nftCount - a.nftCount,
  uniqueOwnerCountAsc: (a, b) => a.uniqueOwnerCount - b.uniqueOwnerCount,
  uniqueOwnerCountDesc: (a, b) => b.uniqueOwnerCount - a.uniqueOwnerCount,
  floorPriceAsc: (a, b) => parseFloat(a.floorPrice || "0") - parseFloat(b.floorPrice || "0"),
  floorPriceDesc: (a, b) => parseFloat(b.floorPrice || "0") - parseFloat(a.floorPrice || "0"),

  totalSalesAsc: (a, b) => (a.totalSales ?? 0) - (b.totalSales ?? 0),
  totalSalesDesc: (a, b) => (b.totalSales ?? 0) - (a.totalSales ?? 0),
  totalSaleVolumeUpasgAsc: (a, b) => parseFloat(a.totalVolume.upasg || "0") - parseFloat(b.totalVolume.upasg || "0"),
  totalSaleVolumeUpasgDesc: (a, b) => parseFloat(b.totalVolume.upasg || "0") - parseFloat(a.totalVolume.upasg || "0"),
  totalSaleVolumeUsdAsc: (a, b) => parseFloat(a.totalVolume.usd || "0") - parseFloat(b.totalVolume.usd || "0"),
  totalSaleVolumeUsdDesc: (a, b) => parseFloat(b.totalVolume.usd || "0") - parseFloat(a.totalVolume.usd || "0"),

  salesInPeriodAsc: (a, b) => (a.salesInPeriod ?? 0) - (b.salesInPeriod ?? 0),
  salesInPeriodDesc: (a, b) => (b.salesInPeriod ?? 0) - (a.salesInPeriod ?? 0),
  volumeInPeriodUpasgAsc: (a, b) => parseFloat(a.volumeInPeriod.upasg || "0") - parseFloat(b.volumeInPeriod.upasg || "0"),
  volumeInPeriodUpasgDesc: (a, b) => parseFloat(b.volumeInPeriod.upasg || "0") - parseFloat(a.volumeInPeriod.upasg || "0"),
  volumeInPeriodUsdAsc: (a, b) => parseFloat(a.volumeInPeriod.usd || "0") - parseFloat(b.volumeInPeriod.usd || "0"),
  volumeInPeriodUsdDesc: (a, b) => parseFloat(b.volumeInPeriod.usd || "0") - parseFloat(a.volumeInPeriod.usd || "0"),

  listedTokenCountAsc: (a, b) => a.listedTokenCount - b.listedTokenCount,
  listedTokenCountDesc: (a, b) => b.listedTokenCount - a.listedTokenCount
};

export type MintStatus = "LIVE" | "COMPLETED" | "NOT_STARTED" | "NOT_MINTABLE" | "ALL";
export const sortOptionsKeys = Object.keys(sortOptions) as (keyof typeof sortOptions)[];
export const mintStatusKeys: MintStatus[] = ["LIVE", "COMPLETED", "NOT_STARTED", "NOT_MINTABLE", "ALL"];
export type SortOptions = keyof typeof sortOptions;

export interface GetCollectionsParams {
  skip?: number;
  limit?: number;
  sort?: SortOptions;
  mintStatus?: string;
  period?: Period; // "24h" | "7d" | "30d"
}

type PeriodSql = { cur: any; prevFrom: any; prevTo: any };
function windowSql(period: Period): PeriodSql {
  if (period === "24h") return { cur: sql`INTERVAL '24 hours'`, prevFrom: sql`INTERVAL '48 hours'`, prevTo: sql`INTERVAL '24 hours'` };
  if (period === "30d") return { cur: sql`INTERVAL '30 days'`, prevFrom: sql`INTERVAL '60 days'`, prevTo: sql`INTERVAL '30 days'` };
  return { cur: sql`INTERVAL '7 days'`, prevFrom: sql`INTERVAL '14 days'`, prevTo: sql`INTERVAL '7 days'` };
}

type PeriodStats = {
  // sales
  totalSales: number;
  totalVolume: { upasg: string | null; usd: string | null };
  salesInPeriod: number;
  salesChangePct: number | null;
  volumeInPeriod: {
    upasg: string | null;
    upasgChangePct: number | null;
    usd: string | null;
    usdChangePct: number | null;
  };
  // mints
  totalMints: number;
  totalMintVolume: { upasg: string | null; usd: string | null };
  mintsInPeriod: number;
  mintsChangePct: number | null;
  mintVolumeInPeriod: {
    upasg: string | null;
    upasgChangePct: number | null;
    usd: string | null;
    usdChangePct: number | null;
  };
};

export async function getCollections(filter: GetCollectionsParams) {
  const nftAgg = db
      .select({
        address: nft.collection,
        nftCount: count().as("nftCount"),
        mintedNftCount: sql<number>`COUNT(*) FILTER (WHERE ${nft.mintedOnBlockHeight} IS NOT NULL)`.as("mintedNftCount"),
        migratedNftCount: sql<number>`COUNT(*) FILTER (WHERE ${nft.migratedOnBlockHeight} IS NOT NULL)`.as("migratedNftCount"),
        availableToMintCount: sql<number>`
            COUNT(*) -
        (
          COUNT(*) FILTER (WHERE ${nft.mintedOnBlockHeight} IS NOT NULL) +
            COUNT(*) FILTER (WHERE ${nft.migratedOnBlockHeight} IS NOT NULL AND ${nft.mintedOnBlockHeight} IS NULL)
            )
        `.as("availableToMintCount"),
        uniqueOwnerCount: countDistinct(nft.owner).as("uniqueOwnerCount"),
      })
      .from(nft)
      .where(notInArray(nft.collection, IGNORED_COLLECTIONS))
      .groupBy(nft.collection)
      .as("nftAgg");

  const listAgg = db
      .select({
        address: nft.collection,
        floorPrice: min(nftListing.forSalePrice).as("floorPrice"),
        listedTokenCount: countDistinct(nftListing.nft).as("listedTokenCount"),
      })
      .from(nftListing)
      .innerJoin(nft, eq(nftListing.nft, nft.id))
      .innerJoin(collection, eq(nft.collection, collection.address))
      .where(and(
          isNull(nftListing.unlistedBlockHeight),
          // A null minPrice must not exclude every listing (gte(x, NULL) is NULL/false).
          // Keep this filter identical across listAgg / getFloorPrice / getListedTokenCount.
          or(isNull(collection.minPrice), gte(nftListing.forSalePrice, collection.minPrice))
      ))
      .groupBy(nft.collection)
      .as("listAgg");

  const base = db
      .select({
        address: collection.address,
        createdHeight: collection.createdHeight,
        name: collection.name,
        symbol: collection.symbol,
        mintContract: collection.mintContract,
        marketContract: collection.marketContract,
        minter: collection.minter,
        creator: collection.creator,
        description: collection.description,
        image: collection.image,
        externalLink: collection.externalLink,
        royaltyAddress: collection.royaltyAddress,
        royaltyFee: collection.royaltyFee,
        maxNumToken: collection.maxNumToken,
        perAddressLimit: collection.perAddressLimit,
        whitelist: collection.whitelist,
        startTime: collection.startTime,
        unitPrice: collection.unitPrice,
        unitDenom: collection.unitDenom,
        collectorAddress: collection.collectorAddress,
        tradingFeeBps: collection.tradingFeeBps,
        minPrice: collection.minPrice,

        nftCount: nftAgg.nftCount,
        mintedNftCount: nftAgg.mintedNftCount,
        migratedNftCount: nftAgg.migratedNftCount,
        availableToMintCount: nftAgg.availableToMintCount,
        uniqueOwnerCount: nftAgg.uniqueOwnerCount,
        floorPrice: listAgg.floorPrice,
        listedTokenCount: listAgg.listedTokenCount,
      })
      .from(collection)
      .innerJoin(nftAgg, eq(collection.address, nftAgg.address))
      .leftJoin(listAgg, eq(collection.address, listAgg.address));

  const sub = base.as("sub");
  let filteredQuery = db.select().from(sub) as any;

  if (filter.mintStatus && filter.mintStatus !== "ALL") {
    const available = sub.availableToMintCount;
    const mintContract = sub.mintContract;
    const startTime = sub.startTime;

    switch (filter.mintStatus) {
      case "LIVE":
        filteredQuery = filteredQuery.where(
            and(
                gt(available, 0),
                isNotNull(mintContract),
                or(isNull(startTime), lte(startTime, sql`NOW()`))
            )
        );
        break;
      case "COMPLETED":
        filteredQuery = filteredQuery.where(
            and(
                eq(available, 0),
                isNotNull(mintContract),
                or(isNull(startTime), lte(startTime, sql`NOW()`))
            )
        );
        break;
      case "NOT_STARTED":
        filteredQuery = filteredQuery.where(
            and(
                isNotNull(mintContract),
                gt(startTime, sql`NOW()`)
            )
        );
        break;
      case "NOT_MINTABLE":
        filteredQuery = filteredQuery.where(isNull(mintContract));
        break;
    }
  }

  const [{ count: total }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(filteredQuery.as("total"));

  const skip = filter.skip ?? 0;
  const limit = filter.limit ?? 20;
  const period = filter.period ?? "7d";

  // ponytail: map + sort the FULL filtered set, then paginate in memory. The stat-based sort
  // keys (volume/sales) are computed per-collection below, so paginating in SQL first (as the
  // prior code did) sorted only the current page and returned the wrong collections for any
  // non-default sort. Fine at Passage's dozens-of-collections scale; if the collection count
  // ever reaches the thousands, push the sort keys into the SQL base query before offset/limit.
  const rows = await filteredQuery
      .orderBy(asc(sub.createdHeight), asc(sub.address));

  const mapped = await Promise.all(
      rows.map(async (col: any) => {
        const baseMapped = await mapCollection(col);
        const stats = await getSaleAndVolumeStats(col.address, period);
        return {
          ...baseMapped,
          ...stats,
          nftCount: Number(col.nftCount) ?? 0,
          uniqueOwnerCount: Number(col.uniqueOwnerCount) ?? 0,
          floorPrice: col.floorPrice ?? null,
          mintedNftCount: Number(col.mintedNftCount) ?? 0,
          remainingMintCount: Number(col.availableToMintCount) ?? 0,
          listedTokenCount: Number(col.listedTokenCount) ?? 0,
        } as MappedCollectionType & PeriodStats;
      })
  );

  const sorted =
      filter.sort && filter.sort !== "createdHeightAsc"
          ? mapped.sort(sortOptions[filter.sort] || sortOptions.createdHeightAsc)
          : mapped;

  return {
    collections: sorted.slice(skip, skip + limit),
    total,
  };
}

export async function getCollectionStats(
    collectionAddress: string,
    pre?: {
      nftCount?: number;
      uniqueOwnerCount?: number;
      floorPrice?: string | null;
      mintedNftCount?: number;
      remainingMintCount?: number;
      listedTokenCount?: number;
    },
    period: Period = "7d"
) {
  const [
    nftCount,
    uniqueOwnerCount,
    floorPrice,
    saleAndVolumeStats,
    listedTokenCount,
    mintedNftCount,
    remainingMintCount
  ] = await Promise.all([
    pre?.nftCount ?? getNftCount(collectionAddress),
    pre?.uniqueOwnerCount ?? getUniqueOwnerCount(collectionAddress),
    pre?.floorPrice ?? getFloorPrice(collectionAddress),
    getSaleAndVolumeStats(collectionAddress, period),
    pre?.listedTokenCount ?? getListedTokenCount(collectionAddress),
    pre?.mintedNftCount ?? getMintedNftCount(collectionAddress),
    pre?.remainingMintCount ?? getRemainingMintCount(collectionAddress),
  ]);

  return {
    nftCount,
    uniqueOwnerCount,
    floorPrice,
    mintedNftCount,
    remainingMintCount,
    ...saleAndVolumeStats,
    listedTokenCount,
  };
}

export async function getFloorPrice(collectionAddress: string) {
  const [{ floorPrice }] = await db
      .select({ floorPrice: min(nftListing.forSalePrice) })
      .from(nftListing)
      .innerJoin(nft, eq(nftListing.nft, nft.id))
      .innerJoin(collection, eq(nft.collection, collection.address))
      .where(and(
          isNull(nftListing.unlistedBlockHeight),
          eq(nft.collection, collectionAddress),
          or(isNull(collection.minPrice), gte(nftListing.forSalePrice, collection.minPrice))
      ));
  return floorPrice;
}

async function getNftCount(collectionAddress: string) {
  const [{ nftCount }] = await db
      .select({ nftCount: count() })
      .from(nft)
      .where(eq(nft.collection, collectionAddress));
  return nftCount;
}

async function getMintedNftCount(collectionAddress: string) {
  const [{ nftCount }] = await db
      .select({ nftCount: count() })
      .from(nft)
      .where(and(eq(nft.collection, collectionAddress), isNotNull(nft.mintedOnBlockHeight)));
  return nftCount;
}

async function getRemainingMintCount(collectionAddress: string) {
  const nftCount = await getNftCount(collectionAddress);
  const [{ ownedCount }] = await db
      .select({ ownedCount: count() })
      .from(nft)
      .where(and(
          eq(nft.collection, collectionAddress),
          or(
              isNotNull(nft.mintedOnBlockHeight),
              and(isNotNull(nft.migratedOnBlockHeight), isNull(nft.mintedOnBlockHeight))
          )
      ));
  return nftCount - ownedCount;
}

async function getListedTokenCount(collectionAddress: string) {
  const [{ listedTokenCount }] = await db
      .select({ listedTokenCount: countDistinct(nftListing.nft) })
      .from(nftListing)
      .innerJoin(nft, eq(nftListing.nft, nft.id))
      .innerJoin(collection, eq(nft.collection, collection.address))
      .where(and(
          isNull(nftListing.unlistedBlockHeight),
          eq(nft.collection, collectionAddress),
          // Match listAgg / getFloorPrice so grid and detail report the same listed count.
          or(isNull(collection.minPrice), gte(nftListing.forSalePrice, collection.minPrice))
      ));
  return listedTokenCount;
}

async function getUniqueOwnerCount(collectionAddress: string) {
  const [{ uniqueOwnerCount }] = await db
      .select({ uniqueOwnerCount: countDistinct(nft.owner) })
      .from(nft)
      .where(eq(nft.collection, collectionAddress));
  return uniqueOwnerCount;
}

const grossNftSaleExpr = sql`(${nftSale.salePrice}::numeric 
                      + ${nftSale.marketFee}::numeric 
                      + ${nftSale.royaltyFee}::numeric)`;

async function getSaleAndVolumeStats(collectionAddress: string | undefined, period: Period): Promise<PeriodStats> {
  const lastProcessedDate = await getLastProcessedISODate();
  const w = windowSql(period);

  const [results] = await db
      .select({
        // Sales aggregates
        totalSales: count(),
        totalVolumeUpasg: sum(grossNftSaleExpr),
        totalVolumeUsd: sum(sql`${grossNftSaleExpr} * ${day.tokenPrice} / 1000000`),

        salesInPeriod: sql`COUNT(*) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - ${w.cur})`.mapWith(Number),
        salesPrevPeriod: sql`COUNT(*) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - ${w.prevFrom} AND ${block.datetime} < ${lastProcessedDate}::timestamp - ${w.prevTo})`.mapWith(Number),

        volumeInPeriodUpasg: sql<string>`SUM(${grossNftSaleExpr}) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - ${w.cur})`,
        volumePrevPeriodUpasg: sql<string>`SUM(${grossNftSaleExpr}) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - ${w.prevFrom} AND ${block.datetime} < ${lastProcessedDate}::timestamp - ${w.prevTo})`,

        volumeInPeriodUsd: sql<number>`SUM(${grossNftSaleExpr} * ${day.tokenPrice} / 1000000) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - ${w.cur})`,
        volumePrevPeriodUsd: sql<number>`SUM(${grossNftSaleExpr} * ${day.tokenPrice} / 1000000) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - ${w.prevFrom} AND ${block.datetime} < ${lastProcessedDate}::timestamp - ${w.prevTo})`,

        // Mint aggregates (scalar subqueries with aliases to avoid row multiplication)
        totalMints: sql<number>`
        (SELECT COUNT(*) FROM ${nft}
         WHERE ${nft.collection} = ${collectionAddress} AND ${nft.mintedOnBlockHeight} IS NOT NULL)
      `,
        totalMintVolumeUpasg: sql<string>`
        (SELECT SUM(${nft.mintPrice}) FROM ${nft}
         WHERE ${nft.collection} = ${collectionAddress} AND ${nft.mintedOnBlockHeight} IS NOT NULL)
      `,
        totalMintVolumeUsd: sql<number>`
        (SELECT SUM(${nft.mintPrice} * ${day.tokenPrice} / 1000000)
           FROM ${nft}
           INNER JOIN ${block} ON ${block.height} = ${nft.mintedOnBlockHeight}
           INNER JOIN ${day} ON ${day.id} = ${block.dayId}
          WHERE ${nft.collection} = ${collectionAddress} AND ${nft.mintedOnBlockHeight} IS NOT NULL)
      `,

        mintsInPeriod: sql<number>`
        (SELECT COUNT(*)
           FROM ${nft}
           INNER JOIN ${block} ON ${block.height} = ${nft.mintedOnBlockHeight}
          WHERE ${nft.collection} = ${collectionAddress}
            AND ${nft.mintedOnBlockHeight} IS NOT NULL
            AND ${block.datetime} >= ${lastProcessedDate}::timestamp - ${w.cur})
      `,
        mintsPrevPeriod: sql<number>`
        (SELECT COUNT(*)
           FROM ${nft}
           INNER JOIN ${block} ON ${block.height} = ${nft.mintedOnBlockHeight}
          WHERE ${nft.collection} = ${collectionAddress}
            AND ${nft.mintedOnBlockHeight} IS NOT NULL
            AND ${block.datetime} >= ${lastProcessedDate}::timestamp - ${w.prevFrom}
            AND ${block.datetime} <  ${lastProcessedDate}::timestamp - ${w.prevTo})
      `,

        mintVolumeInPeriodUpasg: sql<string>`
        (SELECT SUM(${nft.mintPrice})
           FROM ${nft}
           INNER JOIN ${block} ON ${block.height} = ${nft.mintedOnBlockHeight}
          WHERE ${nft.collection} = ${collectionAddress}
            AND ${nft.mintedOnBlockHeight} IS NOT NULL
            AND ${block.datetime} >= ${lastProcessedDate}::timestamp - ${w.cur})
      `,
        mintVolumePrevPeriodUpasg: sql<string>`
        (SELECT SUM(${nft.mintPrice})
           FROM ${nft}
           INNER JOIN ${block} ON ${block.height} = ${nft.mintedOnBlockHeight}
          WHERE ${nft.collection} = ${collectionAddress}
            AND ${nft.mintedOnBlockHeight} IS NOT NULL
            AND ${block.datetime} >= ${lastProcessedDate}::timestamp - ${w.prevFrom}
            AND ${block.datetime} <  ${lastProcessedDate}::timestamp - ${w.prevTo})
      `,

        mintVolumeInPeriodUsd: sql<number>`
        (SELECT SUM(${nft.mintPrice} * ${day.tokenPrice} / 1000000)
           FROM ${nft}
           INNER JOIN ${block} ON ${block.height} = ${nft.mintedOnBlockHeight}
           INNER JOIN ${day} ON ${day.id} = ${block.dayId}
          WHERE ${nft.collection} = ${collectionAddress}
            AND ${nft.mintedOnBlockHeight} IS NOT NULL
            AND ${block.datetime} >= ${lastProcessedDate}::timestamp - ${w.cur})
      `,
        mintVolumePrevPeriodUsd: sql<number>`
        (SELECT SUM(${nft.mintPrice} * ${day.tokenPrice} / 1000000)
           FROM ${nft}
           INNER JOIN ${block} ON ${block.height} = ${nft.mintedOnBlockHeight}
           INNER JOIN ${day} ON ${day.id} = ${block.dayId}
          WHERE ${nft.collection} = ${collectionAddress}
            AND ${nft.mintedOnBlockHeight} IS NOT NULL
            AND ${block.datetime} >= ${lastProcessedDate}::timestamp - ${w.prevFrom}
            AND ${block.datetime} <  ${lastProcessedDate}::timestamp - ${w.prevTo})
      `,
      })
      .from(nftSale)
      .innerJoin(nft, eq(nftSale.nft, nft.id))
      .innerJoin(block, eq(nftSale.saleBlockHeight, block.height))
      .innerJoin(day, eq(block.dayId, day.id))
      .where(eq(nft.collection, collectionAddress));

  const salesChangePct = calcChangePct(results.salesInPeriod ?? 0, results.salesPrevPeriod ?? 0);
  const upasgChangePct = calcChangePct(parseFloat(results.volumeInPeriodUpasg ?? "0"), parseFloat(results.volumePrevPeriodUpasg ?? "0"));
  const usdChangePct = calcChangePct(results.volumeInPeriodUsd ?? 0, results.volumePrevPeriodUsd ?? 0);

  const mintsChangePct = calcChangePct(results.mintsInPeriod ?? 0, results.mintsPrevPeriod ?? 0);
  const mintUpasgChangePct = calcChangePct(parseFloat(results.mintVolumeInPeriodUpasg ?? "0"), parseFloat(results.mintVolumePrevPeriodUpasg ?? "0"));
  const mintUsdChangePct = calcChangePct(results.mintVolumeInPeriodUsd ?? 0, results.mintVolumePrevPeriodUsd ?? 0);

  return {
    // sales
    totalSales: results.totalSales ?? 0,
    totalVolume: {
      upasg: results.totalVolumeUpasg?.toString() ?? "0",
      usd: results.totalVolumeUsd?.toString() ?? "0",
    },
    salesInPeriod: results.salesInPeriod ?? 0,
    salesChangePct,
    volumeInPeriod: {
      upasg: results.volumeInPeriodUpasg ?? "0",
      upasgChangePct: upasgChangePct,
      usd: (results.volumeInPeriodUsd ?? 0)?.toString(),
      usdChangePct: usdChangePct
    },
    // mints
    totalMints: results.totalMints ?? 0,
    totalMintVolume: {
      upasg: results.totalMintVolumeUpasg?.toString() ?? "0",
      usd: (results.totalMintVolumeUsd ?? 0)?.toString()
    },
    mintsInPeriod: results.mintsInPeriod ?? 0,
    mintsChangePct,
    mintVolumeInPeriod: {
      upasg: results.mintVolumeInPeriodUpasg ?? "0",
      upasgChangePct: mintUpasgChangePct,
      usd: (results.mintVolumeInPeriodUsd ?? 0)?.toString(),
      usdChangePct: mintUsdChangePct
    }
  };
}

function calcChangePct(current: number, previous: number) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

type TraitPeriodRow = {
  traitType: string;
  traitValue: string;

  totalSales: number;
  totalVolumeUpasg: string | null;
  totalVolumeUsd: string | null;

  salesInPeriod: number;
  salesPrevPeriod: number | null;

  volumeInPeriodUpasg: string | null;
  volumePrevPeriodUpasg: string | null;

  volumeInPeriodUsd: number | null;
  volumePrevPeriodUsd: number | null;
};

export interface TraitPeriodStats {
  traitType: string;
  traitValue: string;
  totalSales: number;
  totalVolume: { upasg: string | null; usd: string | null };
  salesInPeriod: number;
  salesChangePct: number | null;
  volumeInPeriod: {
    upasg: string | null;
    upasgChangePct: number | null;
    usd: string | null;
    usdChangePct: number | null;
  };
}

function windowFromRange(startISO: string, endISO: string) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    throw new Error("Invalid date range");
  }
  const lenMs = end.getTime() - start.getTime();
  const prevFrom = new Date(start.getTime() - lenMs);
  const prevTo = start;

  // ✅ devolver strings
  return {
    curFrom: start.toISOString(),
    curTo: end.toISOString(),
    prevFrom: prevFrom.toISOString(),
    prevTo: prevTo.toISOString(),
  };
}

export type TraitPair = { traitType: string; traitValue: string };

export async function getCollectionTraitsOnly(
    address: string,
    options: { traitType?: string } = {}
): Promise<TraitPair[]> {
  const col = await db.query.collection.findFirst({
    where: (t) => eq(t.address, address),
  });
  if (!col) throw new Error("Collection not found");

  const rows = await db
      .select({
        traitType: nftTrait.traitType,
        traitValue: nftTrait.traitValue,
      })
      .from(nft)
      .innerJoin(nftToTrait, eq(nftToTrait.nftId, nft.id))
      .innerJoin(nftTrait, eq(nftTrait.id, nftToTrait.traitId))
      .where(
          and(
              eq(nft.collection, address),
              options.traitType ? eq(nftTrait.traitType, options.traitType) : undefined
          )
      )
      .groupBy(nftTrait.traitType, nftTrait.traitValue)
      .orderBy(nftTrait.traitType, nftTrait.traitValue);

  return rows as TraitPair[];
}

export async function getCollectionTraitsStats(
    address: string,
    options: {
      traitType?: string;
      sortBy?: "top" | "trending";
      startDate?: string;
      endDate?: string;
    } = {}
): Promise<TraitPeriodStats[]> {
  const col = await db.query.collection.findFirst({
    where: (t) => eq(t.address, address),
  });
  if (!col) throw new Error("Collection not found");

  if (!options.startDate || !options.endDate) {
    throw new Error("startDate and endDate are required");
  }

  const { curFrom, curTo, prevFrom, prevTo } = windowFromRange(options.startDate, options.endDate);

  const rows = await db
      .select({
        traitType: nftTrait.traitType,
        traitValue: nftTrait.traitValue,

        totalSales: count(),
        totalVolumeUpasg: sum(grossNftSaleExpr),
        totalVolumeUsd: sum(sql`${grossNftSaleExpr} * ${day.tokenPrice} / 1000000`),

        // Ventana actual
        salesInPeriod: sql`COUNT(*) FILTER (WHERE ${block.datetime} >= ${curFrom} AND ${block.datetime} < ${curTo})`.mapWith(Number),
        volumeInPeriodUpasg: sql<string>`SUM(${grossNftSaleExpr}) FILTER (WHERE ${block.datetime} >= ${curFrom} AND ${block.datetime} < ${curTo})`,
        volumeInPeriodUsd: sql<number>`SUM(${grossNftSaleExpr} * ${day.tokenPrice} / 1000000) FILTER (WHERE ${block.datetime} >= ${curFrom} AND ${block.datetime} < ${curTo})`,

        // Ventana previa (mismo tamaño, justo antes)
        salesPrevPeriod: sql<number>`COUNT(*) FILTER (WHERE ${block.datetime} >= ${prevFrom} AND ${block.datetime} < ${prevTo})`,
        volumePrevPeriodUpasg: sql<string>`SUM(${grossNftSaleExpr}) FILTER (WHERE ${block.datetime} >= ${prevFrom} AND ${block.datetime} < ${prevTo})`,
        volumePrevPeriodUsd: sql<number>`SUM(${grossNftSaleExpr} * ${day.tokenPrice} / 1000000) FILTER (WHERE ${block.datetime} >= ${prevFrom} AND ${block.datetime} < ${prevTo})`,
      })
      .from(nftSale)
      .innerJoin(nft, eq(nftSale.nft, nft.id))
      .innerJoin(nftToTrait, eq(nftToTrait.nftId, nft.id))
      .innerJoin(nftTrait, eq(nftTrait.id, nftToTrait.traitId))
      .innerJoin(block, eq(block.height, nftSale.saleBlockHeight))
      .innerJoin(day, eq(day.id, block.dayId))
      .where(
          and(
              eq(nft.collection, address),
              options.traitType ? eq(nftTrait.traitType, options.traitType) : undefined
          )
      )
      .groupBy(nftTrait.traitType, nftTrait.traitValue) as TraitPeriodRow[];

  const mapped: TraitPeriodStats[] = rows.map((r) => {
    const salesChangePct = calcChangePct(r.salesInPeriod ?? 0, r.salesPrevPeriod ?? 0);
    const upasgChangePct = calcChangePct(
        parseFloat(r.volumeInPeriodUpasg ?? "0"),
        parseFloat(r.volumePrevPeriodUpasg ?? "0")
    );
    const usdChangePct = calcChangePct(r.volumeInPeriodUsd ?? 0, r.volumePrevPeriodUsd ?? 0);

    return {
      traitType: r.traitType,
      traitValue: r.traitValue,
      totalSales: r.totalSales ?? 0,
      totalVolume: {
        upasg: r.totalVolumeUpasg?.toString() ?? "0",
        usd: r.totalVolumeUsd?.toString() ?? "0",
      },
      salesInPeriod: r.salesInPeriod ?? 0,
      salesChangePct,
      volumeInPeriod: {
        upasg: r.volumeInPeriodUpasg ?? "0",
        upasgChangePct,
        usd: (r.volumeInPeriodUsd ?? 0)?.toString(),
        usdChangePct,
      },
    };
  });

  if (options.sortBy === "top") {
    mapped.sort(
        (a, b) => parseFloat(b.volumeInPeriod.usd || "0") - parseFloat(a.volumeInPeriod.usd || "0")
    );
  } else if (options.sortBy === "trending") {
    mapped.sort((a, b) => (b.salesInPeriod ?? 0) - (a.salesInPeriod ?? 0));
  }

  return mapped;
}


function calculateUsdPrice(amount: string, tokenPrice: number | null): number | null {
  if (!amount || !tokenPrice) return null;
  return (parseFloat(amount) * tokenPrice) / 1_000_000;
}

function calculateVolumeChange(sales: { priceUsd: number; datetime: Date }[], now: Date, days: number): number | null {
  const periodLength = days * 24 * 60 * 60 * 1000;
  const currentPeriodStart = new Date(now.getTime() - periodLength);
  const previousPeriodStart = new Date(currentPeriodStart.getTime() - periodLength);
  const currentPeriodVolume = sales
      .filter((s) => s.datetime >= currentPeriodStart && s.datetime <= now)
      .reduce((sum, s) => sum + s.priceUsd, 0);
  const previousPeriodVolume = sales
      .filter((s) => s.datetime >= previousPeriodStart && s.datetime < currentPeriodStart)
      .reduce((sum, s) => sum + s.priceUsd, 0);
  if (previousPeriodVolume === 0) return null;
  return Math.round(((currentPeriodVolume - previousPeriodVolume) / previousPeriodVolume) * 100 * 100) / 100;
}
