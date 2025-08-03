import { block, day, db, eq, collection, nft, nftListing, nftSale, and, lte, min, sql, sum, count, countDistinct, gte, nftToTrait, nftTrait, isNull, asc, gt, isNotNull, or } from "database";
import { TraitStats, GetTraitsOptions } from "@src/types/collection";
import { udenomToDenom } from "@src/utils/math";
import { getLastProcessedISODate } from "./block.service";
import {mapCollection} from "@src/utils/collection.util";


type MappedCollectionType = Awaited<ReturnType<typeof mapCollection>>;
const sortOptions: Record<string, (a: MappedCollectionType, b: MappedCollectionType) => number> = {
  createdHeightAsc: (a, b) => a.createdHeight - b.createdHeight,
  createdHeightDesc: (a, b) => b.createdHeight - a.createdHeight,
  nftCountAsc: (a, b) => a.nftCount - b.nftCount,
  nftCountDesc: (a, b) => b.nftCount - a.nftCount,
  uniqueOwnerCountAsc: (a, b) => a.uniqueOwnerCount - b.uniqueOwnerCount,
  uniqueOwnerCountDesc: (a, b) => b.uniqueOwnerCount - a.uniqueOwnerCount,
  floorPriceAsc: (a, b) => parseFloat(a.floorPrice || "0") - parseFloat(b.floorPrice || "0"),
  floorPriceDesc: (a, b) => parseFloat(b.floorPrice || "0") - parseFloat(a.floorPrice || "0"),
  totalSaleCountAsc: (a, b) => a.totalSaleCount - b.totalSaleCount,
  totalSaleCountDesc: (a, b) => b.totalSaleCount - a.totalSaleCount,
  totalSaleVolumeUpasgAsc: (a, b) => parseFloat(a.totalSaleVolume.upasg || "0") - parseFloat(b.totalSaleVolume.upasg || "0"),
  totalSaleVolumeUpasgDesc: (a, b) => parseFloat(b.totalSaleVolume.upasg || "0") - parseFloat(a.totalSaleVolume.upasg || "0"),
  totalSaleVolumeUsdAsc: (a, b) => parseFloat(a.totalSaleVolume.usd || "0") - parseFloat(b.totalSaleVolume.usd || "0"),
  totalSaleVolumeUsdDesc: (a, b) => parseFloat(b.totalSaleVolume.usd || "0") - parseFloat(a.totalSaleVolume.usd || "0"),
  saleCount24hAsc: (a, b) => a.saleCount24h - b.saleCount24h,
  saleCount24hDesc: (a, b) => b.saleCount24h - a.saleCount24h,
  saleVolume24hUpasgAsc: (a, b) => parseFloat(a.saleVolume24h.upasg || "0") - parseFloat(b.saleVolume24h.upasg || "0"),
  saleVolume24hUpasgDesc: (a, b) => parseFloat(b.saleVolume24h.upasg || "0") - parseFloat(a.saleVolume24h.upasg || "0"),
  saleVolume24hUsdAsc: (a, b) => parseFloat(a.saleVolume24h.usd || "0") - parseFloat(b.saleVolume24h.usd || "0"),
  saleVolume24hUsdDesc: (a, b) => parseFloat(b.saleVolume24h.usd || "0") - parseFloat(a.saleVolume24h.usd || "0"),
  saleCount7dAsc: (a, b) => a.saleCount7d - b.saleCount7d,
  saleCount7dDesc: (a, b) => b.saleCount7d - a.saleCount7d,
  saleVolume7dUpasgAsc: (a, b) => parseFloat(a.saleVolume7d.upasg || "0") - parseFloat(b.saleVolume7d.upasg || "0"),
  saleVolume7dUpasgDesc: (a, b) => parseFloat(b.saleVolume7d.upasg || "0") - parseFloat(a.saleVolume7d.upasg || "0"),
  saleVolume7dUsdAsc: (a, b) => parseFloat(a.saleVolume7d.usd || "0") - parseFloat(b.saleVolume7d.usd || "0"),
  saleVolume7dUsdDesc: (a, b) => parseFloat(b.saleVolume7d.usd || "0") - parseFloat(a.saleVolume7d.usd || "0"),
  saleCount30dAsc: (a, b) => a.saleCount30d - b.saleCount30d,
  saleCount30dDesc: (a, b) => b.saleCount30d - a.saleCount30d,
  saleVolume30dUpasgAsc: (a, b) => parseFloat(a.saleVolume30d.upasg || "0") - parseFloat(b.saleVolume30d.upasg || "0"),
  saleVolume30dUpasgDesc: (a, b) => parseFloat(b.saleVolume30d.upasg || "0") - parseFloat(a.saleVolume30d.upasg || "0"),
  saleVolume30dUsdAsc: (a, b) => parseFloat(a.saleVolume30d.usd || "0") - parseFloat(b.saleVolume30d.usd || "0"),
  saleVolume30dUsdDesc: (a, b) => parseFloat(b.saleVolume30d.usd || "0") - parseFloat(a.saleVolume30d.usd || "0"),
  listedTokenCountAsc: (a, b) => a.listedTokenCount - b.listedTokenCount,
  listedTokenCountDesc: (a, b) => b.listedTokenCount - a.listedTokenCount
};


export type MintStatus = "LIVE" | "COMPLETED" | "NOT_STARTED" | "NOT_MINTABLE" | "ALL"
export const sortOptionsKeys = Object.keys(sortOptions) as (keyof typeof sortOptions)[];
export const mintStatusKeys: MintStatus[] = ["LIVE", "COMPLETED", "NOT_STARTED", "NOT_MINTABLE", "ALL"];
export type SortOptions = keyof typeof sortOptions;


export interface GetCollectionsParams {

    skip?: number;
    limit?: number;
    sort?: SortOptions;
    mintStatus?: string

}


export async function getCollections(filter: GetCollectionsParams) {
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
        mintedNftCount: sql<number>`COUNT(*) FILTER (WHERE ${nft.mintedOnBlockHeight} IS NOT NULL)`.as('mintedNftCount'),
        remainingMintCount: sql<number>`COUNT(*) FILTER (
        WHERE ${nft.mintedOnBlockHeight} IS NULL
        AND ${nft.migratedOnBlockHeight} IS NOT NULL
      )`.as('remainingMintCount'),})
      .from(collection)
      .leftJoin(nft, eq(collection.address, nft.collection))
      .groupBy(collection.address);

  let filteredQuery = db.select().from(base.as("sub")) as any;
  const sub = base.as("sub");

  if (filter.mintStatus && filter.mintStatus !== "ALL") {
    const minted = sub.mintedNftCount;
    const remaining = sub.remainingMintCount;

    switch (filter.mintStatus) {
      case "LIVE":
          filteredQuery = filteredQuery.where(and(gt(remaining, 0), gt(minted, 0)));
        break;
      case "COMPLETED":
        filteredQuery = filteredQuery.where(and(eq(remaining, 0), gt(minted, 0)));
        break;
      case "NOT_STARTED":
        filteredQuery = filteredQuery.where(and(eq(minted, 0), gt(remaining, 0)));
        break;
      case "NOT_MINTABLE":
        filteredQuery = filteredQuery.where(and(eq(remaining, 0), eq(minted, 0)));
        break;
    }
  }

  const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(filteredQuery.as("total"));

  const paginated = await filteredQuery
      .orderBy(asc(sub.createdHeight), asc(sub.address))
      .offset(filter.skip)
      .limit(filter.limit);

  const mapped = await Promise.all(
      paginated.map(async (col) => {
        const base = await mapCollection(col);
        const stats = await getCollectionStats(col.address);
        return {
          ...base,
          ...stats,
        };
      })
  );

  // Aplicar sort adicional si es necesario
  const sorted =
      filter.sort && filter.sort !== "createdHeightAsc"
          ? mapped.sort(sortOptions[filter.sort] || sortOptions.createdHeightAsc)
          : mapped;

  return {
    collections: sorted,
    total: count,
  };
}

export async function getCollectionStats(collectionAddress: string) {
  const [nftCount, uniqueOwnerCount, floorPrice, saleAndVolumeStats, listedTokenCount, mintedNftCount, remainingMintCount] = await Promise.all([
    getNftCount(collectionAddress),
    getUniqueOwnerCount(collectionAddress),
    getFloorPrice(collectionAddress),
    getSaleAndVolumeStats(collectionAddress),
    getListedTokenCount(collectionAddress),
    getMintedNftCount(collectionAddress),
    getRemainingMintCount(collectionAddress)
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

async function getFloorPrice(collectionAddress: string) {
  const [{ floorPrice }] = await db
    .select({ floorPrice: min(nftListing.forSalePrice) })
    .from(nftListing)
    .innerJoin(nft, eq(nftListing.nft, nft.id))
    .innerJoin(collection, eq(nft.collection, collection.address))
    .where(and(isNull(nftListing.unlistedBlockHeight), eq(nft.collection, collectionAddress),
        gte(nftListing.forSalePrice, collection.minPrice)));

  return floorPrice;
}

async function getNftCount(collectionAddress: string) {
  const [{ nftCount }] = await db.select({ nftCount: count() }).from(nft).where(eq(nft.collection, collectionAddress));

  return nftCount;
}

async function getMintedNftCount(collectionAddress: string) {
  const [{nftCount}] = await db
      .select({nftCount: count()})
      .from(nft)
      .where(and(eq(nft.collection, collectionAddress), isNotNull(nft.mintedOnBlockHeight)));
  return nftCount;
}

async function getRemainingMintCount(collectionAddress: string) {
  const [{ availableCount }] = await db
      .select({ availableCount: count() })
      .from(nft)
      .where(
          and(
              eq(nft.collection, collectionAddress),
              isNull(nft.mintedOnBlockHeight),
              isNull(nft.migratedOnBlockHeight)
          )
      );

  const [{ usedCount: ownedCount }] = await db
      .select({ usedCount: count() })
      .from(nft)
      .where(
          and(
              eq(nft.collection, collectionAddress),
              or(
                  isNotNull(nft.mintedOnBlockHeight),
                  and(
                      isNotNull(nft.migratedOnBlockHeight),
                      isNull(nft.mintedOnBlockHeight)
                  )
              )
          )
      );

  return availableCount - ownedCount;
}

async function getListedTokenCount(collectionAddress: string) {
  const [{ listedTokenCount }] = await db
    .select({ listedTokenCount: count() })
    .from(nftListing)
    .innerJoin(nft, eq(nftListing.nft, nft.id))
    .where(and(isNull(nftListing.unlistedBlockHeight), eq(nft.collection, collectionAddress)));

  return listedTokenCount;
}

async function getUniqueOwnerCount(collectionAddress: string) {
  const [{ uniqueOwnerCount }] = await db
    .select({ uniqueOwnerCount: countDistinct(nft.owner) })
    .from(nft)
    .where(eq(nft.collection, collectionAddress));

  return uniqueOwnerCount;
}

async function getSaleAndVolumeStats(collectionAddress: string | undefined) {
  const lastProcessedDate = await getLastProcessedISODate();

  const [results] = await db
    .select({
      totalSaleCount: count(),
      totalSaleVolumeUPasg: sum(nftSale.salePrice),
      totalSaleVolumeUSD: sum(sql`${nftSale.salePrice} * ${day.tokenPrice} / 1000000`),
      saleCount24h: sql`COUNT(*) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp::timestamp - INTERVAL '24 hours')`.mapWith(Number),
      saleCount7d: sql`COUNT(*) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '7 days')`.mapWith(Number),
      saleCount30d: sql`COUNT(*) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '30 days')`.mapWith(Number),
      saleVolume24hUPasg: sql<string>`SUM(${nftSale.salePrice}) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '24 hours')`,
      saleVolume7dUPasg: sql<string>`SUM(${nftSale.salePrice}) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '7 days')`,
      saleVolume30dUPasg: sql<string>`SUM(${nftSale.salePrice}) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '30 days')`,
      saleVolume24hUSD: sql<number>`SUM(${nftSale.salePrice} * ${day.tokenPrice} / 1000000) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '24 hours')`,
      saleVolume7dUSD: sql<number>`SUM(${nftSale.salePrice} * ${day.tokenPrice} / 1000000) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '7 days')`,
      saleVolume30dUSD: sql<number>`SUM(${nftSale.salePrice} * ${day.tokenPrice} / 1000000) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '30 days')`,
      saleCount24hComparison:
        sql`COUNT(*) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '48 hours' AND ${block.datetime} < ${lastProcessedDate}::timestamp - INTERVAL '24 hours')`.mapWith(
          Number
        ),
      saleCount7dComparison:
        sql`COUNT(*) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '14 days' AND ${block.datetime} < ${lastProcessedDate}::timestamp - INTERVAL '7 days')`.mapWith(
          Number
        ),
      saleCount30dComparison:
        sql`COUNT(*) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '60 days' AND ${block.datetime} < ${lastProcessedDate}::timestamp - INTERVAL '30 days')`.mapWith(
          Number
        ),
      saleVolume24hUPasgComparison: sql<string>`SUM(${nftSale.salePrice}) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '48 hours' AND ${block.datetime} < ${lastProcessedDate}::timestamp - INTERVAL '24 hours')`,
      saleVolume7dUPasgComparison: sql<string>`SUM(${nftSale.salePrice}) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '14 days' AND ${block.datetime} < ${lastProcessedDate}::timestamp - INTERVAL '7 days')`,
      saleVolume30dUPasgComparison: sql<string>`SUM(${nftSale.salePrice}) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '60 days' AND ${block.datetime} < ${lastProcessedDate}::timestamp - INTERVAL '30 days')`,
      saleVolume24hUSDComparison: sql<number>`SUM(${nftSale.salePrice} * ${day.tokenPrice} / 1000000) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '48 hours' AND ${block.datetime} < ${lastProcessedDate}::timestamp - INTERVAL '24 hours')`,
      saleVolume7dUSDComparison: sql<number>`SUM(${nftSale.salePrice} * ${day.tokenPrice} / 1000000) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '14 days' AND ${block.datetime} < ${lastProcessedDate}::timestamp - INTERVAL '7 days')`,
      saleVolume30dUSDComparison: sql<number>`SUM(${nftSale.salePrice} * ${day.tokenPrice} / 1000000) FILTER (WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '60 days' AND ${block.datetime} < ${lastProcessedDate}::timestamp - INTERVAL '30 days')`
    })
    .from(nftSale)
    .innerJoin(nft, eq(nftSale.nft, nft.id))
    .innerJoin(block, eq(nftSale.saleBlockHeight, block.height))
    .innerJoin(day, eq(block.dayId, day.id))
    .where(and(eq(nft.collection, collectionAddress)));

  return {
    totalSaleCount: results.totalSaleCount,
    totalSaleVolume: { upasg: results.totalSaleVolumeUPasg, usd: results.totalSaleVolumeUSD },
    saleCount24h: results.saleCount24h,
    saleCount24hChangePercentage: calculateChangePercentage(results.saleCount24h, results.saleCount24hComparison),
    saleVolume24h: {
      upasg: results.saleVolume24hUPasg,
      upasgChangePercentage: calculateChangePercentage(parseFloat(results.saleVolume24hUPasg), parseFloat(results.saleVolume24hUPasgComparison)),
      usd: results.saleVolume24hUSD?.toString(),
      usdChangePercentage: calculateChangePercentage(results.saleVolume24hUSD, results.saleVolume24hUSDComparison)
    },
    saleCount7d: results.saleCount7d,
    saleCount7dChangePercentage: calculateChangePercentage(results.saleCount7d, results.saleCount7dComparison),
    saleVolume7d: {
      upasg: results.saleVolume7dUPasg,
      upasgChangePercentage: calculateChangePercentage(parseFloat(results.saleVolume7dUPasg), parseFloat(results.saleVolume7dUPasgComparison)),
      usd: results.saleVolume7dUSD?.toString(),
      usdChangePercentage: calculateChangePercentage(results.saleVolume7dUSD, results.saleVolume7dUSDComparison)
    },
    saleCount30d: results.saleCount30d,
    saleCount30dChangePercentage: calculateChangePercentage(results.saleCount30d, results.saleCount30dComparison),
    saleVolume30d: {
      upasg: results.saleVolume30dUPasg,
      upasgChangePercentage: calculateChangePercentage(parseFloat(results.saleVolume30dUPasg), parseFloat(results.saleVolume30dUPasgComparison)),
      usd: results.saleVolume30dUSD?.toString(),
      usdChangePercentage: calculateChangePercentage(results.saleVolume30dUSD, results.saleVolume30dUSDComparison)
    }
  };
}

function calculateChangePercentage(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export async function getCollectionTraits(address: string, options: GetTraitsOptions): Promise<TraitStats[]> {
  const collection = await db.query.collection.findFirst({
    where: (table) => eq(table.address, address)
  });

  if (!collection) {
    throw new Error("Collection not found");
  }

  // Build date filters
  const dateFilters = [];
  if (options.startDate) {
    dateFilters.push(gte(block.datetime, new Date(options.startDate)));
  }
  if (options.endDate) {
    dateFilters.push(lte(block.datetime, new Date(options.endDate)));
  }

  // First, get all unique traits for the collection
  const nftsWithTraits = await db.query.nftTrait.findMany({
    where: (table) => and(eq(table.collection, address), options.traitType ? eq(table.traitType, options.traitType) : undefined),
    columns: {
      id: true,
      traitType: true,
      traitValue: true
    }
  });

  // Then, get sales data in a separate query
  const salesData = await db
    .select({
      traitId: nftTrait.id,
      salePrice: nftSale.salePrice,
      saleDenom: nftSale.saleDenom,
      datetime: block.datetime,
      tokenPrice: day.tokenPrice
    })
    .from(nftSale)
    .innerJoin(nft, eq(nft.id, nftSale.nft))
    .innerJoin(nftToTrait, eq(nftToTrait.nftId, nft.id))
    .innerJoin(nftTrait, eq(nftTrait.id, nftToTrait.traitId))
    .innerJoin(block, eq(block.height, nftSale.saleBlockHeight))
    .innerJoin(day, eq(day.id, block.dayId))
    .where(and(eq(nftTrait.collection, address), options.traitType ? eq(nftTrait.traitType, options.traitType) : undefined, ...dateFilters));

  // Create a map to store sales data by trait
  const traitSalesMap = new Map<
    string,
    {
      sales: {
        priceUsd: number;
        pricePasg: number;
        datetime: Date;
      }[];
      totalSales: number;
      volumeUsd: number;
      volumePasg: number;
      averagePriceUsd: number;
      averagePricePasg: number;
    }
  >();

  // Process sales data
  salesData.forEach((sale) => {
    const trait = nftsWithTraits.find((t) => t.id === sale.traitId);
    if (!trait) return;

    const key = `${trait.traitType}:${trait.traitValue}`;
    if (!traitSalesMap.has(key)) {
      traitSalesMap.set(key, {
        sales: [],
        totalSales: 0,
        volumeUsd: 0,
        volumePasg: 0,
        averagePriceUsd: 0,
        averagePricePasg: 0
      });
    }

    const pricePasg = udenomToDenom(parseFloat(sale.salePrice));
    const priceUsd = calculateUsdPrice(sale.salePrice, sale.tokenPrice);

    if (priceUsd && pricePasg) {
      const data = traitSalesMap.get(key)!;
      data.sales.push({
        priceUsd,
        pricePasg,
        datetime: sale.datetime
      });
      data.totalSales++;
      data.volumeUsd += priceUsd;
      data.volumePasg += pricePasg;
      data.averagePriceUsd = data.volumeUsd / data.totalSales;
      data.averagePricePasg = data.volumePasg / data.totalSales;
    }
  });

  // Create trait stats using the same key format
  const traitStats = new Map<string, TraitStats>();

  nftsWithTraits.forEach((trait) => {
    const key = `${trait.traitType}:${trait.traitValue}`;
    if (!traitStats.has(key)) {
      traitStats.set(key, {
        traitType: trait.traitType,
        traitValue: trait.traitValue,
        metrics: {
          totalSales: 0,
          volumeUsd: 0,
          volumePasg: 0,
          priceUsd: 0,
          pricePasg: 0,
          change24HourPercent: null,
          change7DayPercent: null,
          change30DayPercent: null
        }
      });
    }

    const stats = traitStats.get(key)!;
    const salesData = traitSalesMap.get(key);

    if (salesData) {
      const now = new Date();
      const sales = salesData.sales.sort((a, b) => b.datetime.getTime() - a.datetime.getTime());

      stats.metrics.totalSales = salesData.totalSales;
      stats.metrics.volumeUsd = salesData.volumeUsd;
      stats.metrics.volumePasg = salesData.volumePasg;
      stats.metrics.priceUsd = salesData.averagePriceUsd;
      stats.metrics.pricePasg = salesData.averagePricePasg;

      // Calculate percent changes
      stats.metrics.change24HourPercent = calculateVolumeChange(sales, now, 1);
      stats.metrics.change7DayPercent = calculateVolumeChange(sales, now, 7);
      stats.metrics.change30DayPercent = calculateVolumeChange(sales, now, 30);
    }
  });

  const results = Array.from(traitStats.values());
  return sortTraitStats(results, options.sortBy);
}

function sortTraitStats(stats: TraitStats[], sortBy?: "top" | "trending"): TraitStats[] {
  if (sortBy === "top") {
    return stats.sort((a, b) => b.metrics.volumeUsd - a.metrics.volumeUsd);
  } else if (sortBy === "trending") {
    return stats.sort((a, b) => b.metrics.totalSales - a.metrics.totalSales);
  }
  return stats;
}

function calculateUsdPrice(amount: string, tokenPrice: number | null): number | null {
  if (!amount || !tokenPrice) {
    return null;
  }
  return (parseFloat(amount) * tokenPrice) / 1_000_000;
}

function calculateVolumeChange(sales: { priceUsd: number; datetime: Date }[], now: Date, days: number): number | null {
  // Convert days to milliseconds
  const periodLength = days * 24 * 60 * 60 * 1000;

  // Calculate period boundaries
  const currentPeriodStart = new Date(now.getTime() - periodLength);
  const previousPeriodStart = new Date(currentPeriodStart.getTime() - periodLength);

  // Calculate current period volume (last X days)
  const currentPeriodVolume = sales.filter((sale) => sale.datetime >= currentPeriodStart && sale.datetime <= now).reduce((sum, sale) => sum + sale.priceUsd, 0);

  // Calculate previous period volume (X days before that)
  const previousPeriodVolume = sales
    .filter((sale) => sale.datetime >= previousPeriodStart && sale.datetime < currentPeriodStart)
    .reduce((sum, sale) => sum + sale.priceUsd, 0);

  // If there were no sales in the previous period, return null
  if (previousPeriodVolume === 0) return null;

  // Calculate percent change
  const percentChange = ((currentPeriodVolume - previousPeriodVolume) / previousPeriodVolume) * 100;
  return Math.round(percentChange * 100) / 100; // Round to 2 decimal places
}
