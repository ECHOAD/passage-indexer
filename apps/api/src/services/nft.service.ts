// nft.service.ts
import {
  and, asc, block, block as blockTable, collection, count, day as dayTable, db, desc, eq,
  isNull, nft, nftAuction, nftBid, nftListing, nftTrait, aliasedTable as alias, inArray, nftToTrait,
  nftSale, notInArray, sql
} from "database";
import { getLastProcessedISODate } from "./block.service";
import { IGNORED_COLLECTIONS } from "@src/utils/constants";
import {getCollectionStats, getFloorPrice} from "@src/services/collection.service";

type SaleType = "FIXED_PRICE" | "LIVE_AUCTION" | "NOT_FOR_SALE" | string;
type TraitInput = { trait_type: string; trait_value: string };
type Period = "24h" | "7d" | "30d";
type GetNftsArgs = {
  collectionAddress?: string;
  saleType?: SaleType;
  sort?: string;
  skip: number;
  limit: number;
  minPrice?: number;
  maxPrice?: number;
  traits?: TraitInput[];
  period?: Period;
};

const safeTokenIdNumeric = (expr: any) =>
    sql`NULLIF(regexp_replace((${expr})::text, '[^0-9]', '', 'g'), '')::numeric`;

const existsOpenListing = (nftIdExpr: any) => sql<boolean>`
    EXISTS (
    SELECT 1 FROM ${nftListing}
    WHERE ${nftListing.nft} = ${nftIdExpr}
    AND ${nftListing.unlistedBlockHeight} IS NULL
    )`;

const existsActiveAuction = (nftIdExpr: any) => sql<boolean>`
    EXISTS (
    SELECT 1 FROM ${nftAuction}
    WHERE ${nftAuction.nftId} = ${nftIdExpr}
    AND ${nftAuction.status} = 'active'
    )`;

function priceBounds(nftIdExpr: any, minPrice?: number, maxPrice?: number) {
  const minCond = typeof minPrice === "number" ? sql<boolean>`
      EXISTS (
      SELECT 1 FROM ${nftListing}
      WHERE ${nftListing.nft} = ${nftIdExpr}
      AND ${nftListing.unlistedBlockHeight} IS NULL
      AND ${nftListing.forSalePrice} >= ${minPrice}
      )` : undefined;

  const maxCond = typeof maxPrice === "number" ? sql<boolean>`
      EXISTS (
      SELECT 1 FROM ${nftListing}
      WHERE ${nftListing.nft} = ${nftIdExpr}
      AND ${nftListing.unlistedBlockHeight} IS NULL
      AND ${nftListing.forSalePrice} <= ${maxPrice}
      )` : undefined;

  return { minCond, maxCond };
}

function traitsWhere({
                       traits,
                       collectionAddress,
                       nftIdExpr,
                     }: {
  traits?: TraitInput[];
  collectionAddress?: string;
  nftIdExpr: any;
}) {
  if (!traits || traits.length === 0) return undefined;

  const grouped = traits.reduce<Record<string, string[]>>((acc, t) => {
    const k = t.trait_type;
    (acc[k] ||= []).push(t.trait_value);
    return acc;
  }, {});

  const t = alias(nftTrait, "t");
  const nt = alias(nftToTrait, "nt");

  const perType = Object.entries(grouped)
      .map(([type, values]) => {
        const unique = Array.from(new Set(values));
        if (unique.length === 0) return undefined;

        const sub = db
            .select({ one: sql`1` })
            .from(nt)
            .innerJoin(t, eq(t.id, nt.traitId))
            .where(and(
                eq(nt.nftId, nftIdExpr),
                eq(t.traitType, type),
                inArray(t.traitValue, unique),
                collectionAddress ? eq(t.collection, collectionAddress) : undefined
            ));

        return sql<boolean>`EXISTS (${sub})`;
      })
      .filter(Boolean) as any[];

  return perType.length ? and(...perType) : undefined;
}

function saleTypeWhere(saleType: SaleType | undefined, nftIdExpr: any) {
  if (!saleType) return undefined;
  if (saleType === "FIXED_PRICE") return existsOpenListing(nftIdExpr);
  if (saleType === "LIVE_AUCTION") return existsActiveAuction(nftIdExpr);
  if (saleType === "NOT_FOR_SALE") {
    return sql<boolean>`NOT (${existsOpenListing(nftIdExpr)} OR ${existsActiveAuction(nftIdExpr)})`;
  }
  return undefined;
}

export const nftSortOptions = [
  "tokenIdAsc", "tokenIdDesc", "tokenIdAlphaAsc", "tokenIdAlphaDesc",
  "priceAsc", "priceDesc",
  "totalSalesDesc",
  "salesInPeriodDesc",
  "salesChangePctDesc",
  "lastSoldDesc", "lastSoldAsc",
  "volumeDesc", "volumeAsc",
];

export async function getNftActiveListings(nftId: string) {
  const listings = await db
      .select()
      .from(nftListing)
      .leftJoin(blockTable, eq(nftListing.forSaleBlockHeight, blockTable.height))
      .innerJoin(dayTable, eq(blockTable.dayId, dayTable.id))
      .where(and(eq(nftListing.nft, nftId), isNull(nftListing.unlistedBlockHeight)))
      .orderBy(asc(nftListing.forSaleBlockHeight));

  return listings.map((x) => ({
    ...x.nft_listing,
    block: { ...x.block, day: x.day }
  }));
}

export async function getNftBids(nftId: string) {
  const bids = await db
      .select()
      .from(nftBid)
      .leftJoin(blockTable, eq(nftBid.bidBlockHeight, blockTable.height))
      .innerJoin(dayTable, eq(blockTable.dayId, dayTable.id))
      .where(eq(nftBid.nft, nftId))
      .orderBy(asc(nftBid.bidBlockHeight));

  return bids.map((x) => ({
    ...x.nft_bid,
    block: { ...x.block, day: x.day }
  }));
}

export async function getNftSales(nftId: string) {
  const sales = await db
      .select()
      .from(nftSale)
      .leftJoin(blockTable, eq(nftSale.saleBlockHeight, blockTable.height))
      .innerJoin(dayTable, eq(blockTable.dayId, dayTable.id))
      .innerJoin(nft, eq(nftSale.nft, nft.id))
      .where(and(eq(nftSale.nft, nftId), notInArray(nft.collection, IGNORED_COLLECTIONS)))
      .orderBy(asc(nftSale.saleBlockHeight));

  return sales.map((x) => ({
    ...x.nft_sale,
    block: { ...x.block, day: x.day }
  }));
}

export async function getRecentNftSales({
                                          skip,
                                          limit,
                                          collectionAddress,
                                        }: {
  skip: number;
  limit: number;
  collectionAddress?: string;
}) {
  const inCollection = collectionAddress
      ? eq(nft.collection, collectionAddress)
      : undefined;

  // Consulta con paginación
  const rows = await db
      .select({
        saleBlockHeight: nftSale.saleBlockHeight,
        saleAt: blockTable.datetime,
        salePrice: grossExpr,
        saleDenom: nftSale.saleDenom,
        nftId: nft.id,
        tokenId: nft.tokenId,
        owner: nft.owner,
        collectionAddress: collection.address,
        collectionName: collection.name,
        metadata: nft.metadata,
      })
      .from(nftSale)
      .innerJoin(nft, eq(nft.id, nftSale.nft))
      .innerJoin(blockTable, eq(blockTable.height, nftSale.saleBlockHeight))
      .innerJoin(collection, eq(collection.address, nft.collection))
      .where(and(notInArray(nft.collection, IGNORED_COLLECTIONS), inCollection))
      .orderBy(desc(blockTable.datetime), desc(nftSale.saleBlockHeight))
      .offset(skip)
      .limit(limit);

  const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(nftSale)
      .innerJoin(nft, eq(nft.id, nftSale.nft))
      .innerJoin(blockTable, eq(blockTable.height, nftSale.saleBlockHeight))
      .innerJoin(collection, eq(collection.address, nft.collection))
      .where(and(notInArray(nft.collection, IGNORED_COLLECTIONS), inCollection));

  const items = rows.map((r) => ({
    saleBlockHeight: r.saleBlockHeight,
    saleAt: r.saleAt,
    salePrice: r.salePrice,
    saleDenom: r.saleDenom,
    nft: {
      id: r.nftId,
      tokenId: r.tokenId,
      owner: r.owner,
      collection: {
        address: r.collectionAddress,
        name: r.collectionName,
      },
      metadata: r.metadata,
    },
  }));

  return {
    items,
    pagination: {
      total: Math.ceil(totalCount / limit),
    },
  };
}

const grossExpr = sql`(${nftSale.salePrice}::numeric 
                      + ${nftSale.marketFee}::numeric 
                      + ${nftSale.royaltyFee}::numeric)`;

function windowSql(period: Period) {
  if (period === "24h") return { cur: sql`INTERVAL '24 hours'`, prev: sql`INTERVAL '24 hours'` };
  if (period === "30d") return { cur: sql`INTERVAL '30 days'`, prev: sql`INTERVAL '30 days'` };
  return { cur: sql`INTERVAL '7 days'`, prev: sql`INTERVAL '7 days'` };
}

export async function getNftsWithStats(args: GetNftsArgs) {
  const {
    collectionAddress,
    saleType,
    sort,
    skip,
    limit,
    minPrice,
    maxPrice,
    traits,
    period = "7d"
  } = args;

  const inCollection = collectionAddress ? eq(nft.collection, collectionAddress) : undefined;
  const notIgnored = notInArray(nft.collection, IGNORED_COLLECTIONS);
  const saleTypeCond = saleTypeWhere(saleType, nft.id);
  const { minCond, maxCond } = priceBounds(nft.id, minPrice, maxPrice);
  const traitsCond = traitsWhere({ traits, collectionAddress, nftIdExpr: nft.id });

  const nftFilterFn = and(notIgnored, inCollection, saleTypeCond, minCond, maxCond, traitsCond);

  const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(nft)
      .where(nftFilterFn);

  const lastProcessedDate = await getLastProcessedISODate();
  const w = windowSql(period);


  const nowTs = sql`${lastProcessedDate}::timestamptz`;

  const salesAgg = db.$with("sales_agg").as(
      db
          .select({
            nftId: nftSale.nft,

            totalSales: sql<number>`COUNT(*)`.as("total_sales"),
            totalVolume: sql<string>`SUM(${grossExpr})`.as("total_volume"), // <-- GROSS

            salesInPeriod: sql<number>`
                COUNT(*) FILTER (
          WHERE ${block.datetime} >= (${nowTs} - ${w.cur})
                AND ${block.datetime} <  ${nowTs}
                )
            `.as("sales_in_period"),

            volumeInPeriod: sql<string>`
                SUM(${grossExpr}) FILTER (
                WHERE ${block.datetime} >= (${nowTs} - ${w.cur})
                AND ${block.datetime} <  ${nowTs}
                )
            `.as("volume_in_period"),

            salesInPeriodCmp: sql<number>`
                COUNT(*) FILTER (
          WHERE ${block.datetime} >= (${nowTs} - ${w.cur} - ${w.prev})
                AND ${block.datetime} <  (${nowTs} - ${w.cur})
                )
            `.as("sales_in_period_cmp"),

            volumeInPeriodCmp: sql<string>`
                SUM(${grossExpr}) FILTER (
                WHERE ${block.datetime} >= (${nowTs} - ${w.cur} - ${w.prev})
                AND ${block.datetime} <  (${nowTs} - ${w.cur})
                )
            `.as("volume_in_period_cmp"),

            lastSaleBlockHeight: sql<number>`MAX(${nftSale.saleBlockHeight})`.as("last_sale_block_height"),
            lastSaleAt: sql<Date>`MAX(${block.datetime})`.as("last_sale_at"),
          })
          .from(nftSale)
          .innerJoin(nft, eq(nft.id, nftSale.nft))
          .innerJoin(block, eq(block.height, nftSale.saleBlockHeight))
          .where(and(notIgnored, inCollection))
          .groupBy(nftSale.nft)
  );

  const lastSaleInfo = db.$with("last_sale_info").as(
      db
          .with(salesAgg)
          .select({
            nftId: salesAgg.nftId,

            // neto
            lastSalePrice: nftSale.salePrice,

            // denom
            lastSaleDenom: nftSale.saleDenom,

            // gross
            lastSaleGross: sql<string>`
                (${nftSale.salePrice}::numeric
                    + ${nftSale.marketFee}::numeric
                    + ${nftSale.royaltyFee}::numeric)
            `.as("last_sale_gross"),
          })
          .from(salesAgg)
          .innerJoin(
              nftSale,
              and(
                  eq(nftSale.nft, salesAgg.nftId),
                  eq(nftSale.saleBlockHeight, salesAgg.lastSaleBlockHeight)
              )
          )
  );

  const nftsStats = db.$with("nfts_stats").as(
      db
          .with(salesAgg, lastSaleInfo)
          .select({
            id: nft.id,
            tokenId: nft.tokenId,
            owner: nft.owner,
            collectionAddress: collection.address,
            collectionName: collection.name,
            metadata: nft.metadata,
            createdOnBlockHeight: nft.createdOnBlockHeight,
            mintedOnBlockHeight: nft.mintedOnBlockHeight,
            mintPrice: nft.mintPrice,
            mintDenom: nft.mintDenom,
            forSaleRawTokenId: nftListing.rawTokenId,
            forSalePrice: nftListing.forSalePrice,
            forSaleDenom: nftListing.forSaleDenom,
            hasActiveAuction: existsActiveAuction(nft.id).as("has_active_auction"),

            totalSales: sql<number>`COALESCE(${salesAgg.totalSales}, 0)`.as("total_sales"),
            totalVolume: salesAgg.totalVolume,

            salesInPeriod: sql<number>`COALESCE(${salesAgg.salesInPeriod}, 0)`.as("sales_in_period"),
            volumeInPeriod: salesAgg.volumeInPeriod,

            salesChangePct: sql<number>`
          CASE
            WHEN ${salesAgg.salesInPeriodCmp} IS NULL OR (${salesAgg.salesInPeriodCmp}) = 0 THEN NULL
            ELSE ( ( (${salesAgg.salesInPeriod})::numeric - (${salesAgg.salesInPeriodCmp})::numeric )
                    / NULLIF((${salesAgg.salesInPeriodCmp})::numeric, 0) ) * 100
          END
        `.as("sales_change_pct"),
            volumeChangePct: sql<number>`
          CASE
            WHEN ${salesAgg.volumeInPeriodCmp} IS NULL OR (${salesAgg.volumeInPeriodCmp})::numeric = 0 THEN NULL
            ELSE ( ( (${salesAgg.volumeInPeriod})::numeric - (${salesAgg.volumeInPeriodCmp})::numeric )
                    / NULLIF((${salesAgg.volumeInPeriodCmp})::numeric, 0) ) * 100
          END
        `.as("volume_change_pct"),

            lastSaleBlockHeight: salesAgg.lastSaleBlockHeight,
            lastSaleAt: salesAgg.lastSaleAt,
            lastSalePrice: lastSaleInfo.lastSalePrice,
            lastSaleDenom: lastSaleInfo.lastSaleDenom,
          })
          .from(nft)
          .innerJoin(collection, eq(collection.address, nft.collection))
          .leftJoin(nftListing, and(eq(nftListing.nft, nft.id), isNull(nftListing.unlistedBlockHeight)))
          .leftJoin(salesAgg, eq(nft.id, salesAgg.nftId))
          .leftJoin(lastSaleInfo, eq(nft.id, lastSaleInfo.nftId))
          .where(nftFilterFn)
  );

  const tokenNumAsc = asc(safeTokenIdNumeric(nftsStats.tokenId));
  const tokenNumDesc = desc(safeTokenIdNumeric(nftsStats.tokenId));
  const tokenAlphaAsc = asc(nftsStats.tokenId);
  const tokenAlphaDesc = desc(nftsStats.tokenId);

  const sortMapping: Record<string, any> = {
    priceAsc: asc(nftsStats.forSalePrice),
    priceDesc: desc(nftsStats.forSalePrice),
    tokenIdAsc: tokenNumAsc,
    tokenIdDesc: tokenNumDesc,
    tokenIdAlphaAsc: tokenAlphaAsc,
    tokenIdAlphaDesc: tokenAlphaDesc,
    totalSalesDesc: desc(nftsStats.totalSales),
    salesInPeriodDesc: desc(nftsStats.salesInPeriod),
    salesChangePctDesc: desc(nftsStats.salesChangePct),
    lastSoldDesc: desc(nftsStats.lastSaleBlockHeight),
    lastSoldAsc: asc(nftsStats.lastSaleBlockHeight),
    volumeDesc: desc(nftsStats.totalVolume),
    volumeAsc: asc(nftsStats.totalVolume),
  };

  const primarySort = sortMapping[sort ?? "tokenIdAsc"] ?? tokenNumAsc;

  const tiebreakers = [
    desc(nftsStats.lastSaleBlockHeight),
    tokenNumAsc,
    tokenAlphaAsc,
    asc(nftsStats.id),
  ];

  const nfts = await db
      .with(nftsStats)
      .select()
      .from(nftsStats)
      .orderBy(primarySort, ...tiebreakers)
      .offset(skip)
      .limit(limit);

  return { nfts, totalCount };
}
