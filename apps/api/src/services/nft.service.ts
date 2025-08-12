import {
    and,
    asc,
    block,
    block as blockTable,
    collection,
    count,
    day as dayTable,
    db,
    desc,
    eq,
    isNotNull,
    isNull,
    nft,
    nftBid,
    nftListing,
    nftSale, notInArray,
    sql
} from "database";
import { getLastProcessedISODate } from "./block.service";
import {IGNORED_COLLECTIONS} from "@src/utils/constants";

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
    .where(and(eq(nftSale.nft, nftId) , notInArray(nft.collection, IGNORED_COLLECTIONS)))
    .orderBy(asc(nftSale.saleBlockHeight));

  return sales.map((x) => ({
    ...x.nft_sale,
    block: { ...x.block, day: x.day }
  }));
}

export const nftSortOptions = [
  "tokenIdAsc",
  "tokenIdDesc",
  "priceAsc",
  "priceDesc",
  "saleCountAsc",
  "saleCountDesc",
  "saleCount24hAsc",
  "saleCount24hDesc",
  "saleCount7dAsc",
  "saleCount7dDesc",
  "saleCount30dAsc",
  "saleCount30dDesc",
  "saleCount24hPercentageChangeAsc",
  "saleCount24hPercentageChangeDesc",
  "saleCount7dPercentageChangeAsc",
  "saleCount7dPercentageChangeDesc",
  "saleCount30dPercentageChangeAsc",
  "saleCount30dPercentageChangeDesc"
];

export async function getNftsWithStats({
                                           collectionAddress,
                                           saleType,
                                           sort,
                                           skip,
                                           limit
                                       }: {
    collectionAddress?: string;
    saleType?: string;
    sort: string;
    skip: number;
    limit: number;
}) {
    const inCollection = eq(nft.collection, collectionAddress!).if(!!collectionAddress);

    const hasOpenListingExists = sql<boolean>`
    EXISTS (
      SELECT 1
      FROM ${nftListing}
      WHERE ${nftListing.nft} = ${nft.id}
        AND ${nftListing.unlistedBlockHeight} IS NULL
    )
  `;

    const noOpenListingExists = sql<boolean>`NOT ${hasOpenListingExists}`;

    const nftFilterFn = and(
        inCollection,
        saleType === "FIXED_PRICE" ? hasOpenListingExists : undefined,
        saleType === "NOT_FOR_SALE" ? noOpenListingExists : undefined
    );

    const [{ count: totalCount }] = await db
        .select({ count: count() })
        .from(nft)
        .where(nftFilterFn);

    const lastProcessedDate = await getLastProcessedISODate();

    const nftsDataSql = db.$with("nfts_data").as(
        db
            .select({
                nftId: nftSale.nft,
                saleCount: sql<string>`COUNT(*)`.as("sale_count"),
                saleCount24h: sql<string>`
          COUNT(*) FILTER (WHERE ${block.datetime} > ${lastProcessedDate}::timestamp - INTERVAL '24 hours')
        `.as("sale_count_24h"),
                saleCount7d: sql<string>`
          COUNT(*) FILTER (WHERE ${block.datetime} > ${lastProcessedDate}::timestamp - INTERVAL '7 days')
        `.as("sale_count_7d"),
                saleCount30d: sql<string>`
          COUNT(*) FILTER (WHERE ${block.datetime} > ${lastProcessedDate}::timestamp - INTERVAL '30 days')
        `.as("sale_count_30d"),
                saleCount24hComparison: sql<string>`
          COUNT(*) FILTER (
            WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '48 hours'
              AND ${block.datetime} <  ${lastProcessedDate}::timestamp - INTERVAL '24 hours'
          )
        `.as("sale_count_24h_comparison"),
                saleCount7dComparison: sql<string>`
          COUNT(*) FILTER (
            WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '14 days'
              AND ${block.datetime} <  ${lastProcessedDate}::timestamp - INTERVAL '7 days'
          )
        `.as("sale_count_7d_comparison"),
                saleCount30dComparison: sql<string>`
          COUNT(*) FILTER (
            WHERE ${block.datetime} >= ${lastProcessedDate}::timestamp - INTERVAL '60 days'
              AND ${block.datetime} <  ${lastProcessedDate}::timestamp - INTERVAL '30 days'
          )
        `.as("sale_count_30d_comparison")
            })
            .from(nftSale)
            .innerJoin(nft, eq(nft.id, nftSale.nft))
            .innerJoin(block, eq(block.height, nftSale.saleBlockHeight))
            .where(inCollection) // solo limitamos por colección aquí si aplica
            .groupBy(nftSale.nft)
    );

    const nftsStatsSql = db.$with("nfts_stats").as(
        db
            .with(nftsDataSql)
            .select({
                tokenId: nft.tokenId,
                owner: nft.owner,
                collectionAddress: collection.address,
                collectionName: collection.name,
                metadata: nft.metadata,
                createdOnBlockHeight: nft.createdOnBlockHeight,
                mintedOnBlockHeight: nft.mintedOnBlockHeight,
                mintPrice: nft.mintPrice,
                mintDenom: nft.mintDenom,
                forSalePrice: nftListing.forSalePrice,
                forSaleDenom: nftListing.forSaleDenom,
                saleCount: nftsDataSql.saleCount,
                saleCount24h: nftsDataSql.saleCount24h,
                saleCount7d: nftsDataSql.saleCount7d,
                saleCount30d: nftsDataSql.saleCount30d,
                // (current - prev) / prev * 100
                saleCount24hPercentageChange: sql<number>`
          CASE
            WHEN (${nftsDataSql.saleCount24hComparison}) = 0 THEN NULL
            ELSE ( (${nftsDataSql.saleCount24h}::numeric - ${nftsDataSql.saleCount24hComparison}::numeric)
                  / NULLIF(${nftsDataSql.saleCount24hComparison}::numeric, 0) ) * 100
          END
        `.as("sale_count_24h_percentage_change"),
                saleCount7dPercentageChange: sql<number>`
          CASE
            WHEN (${nftsDataSql.saleCount7dComparison}) = 0 THEN NULL
            ELSE ( (${nftsDataSql.saleCount7d}::numeric - ${nftsDataSql.saleCount7dComparison}::numeric)
                  / NULLIF(${nftsDataSql.saleCount7dComparison}::numeric, 0) ) * 100
          END
        `.as("sale_count_7d_percentage_change"),
                saleCount30dPercentageChange: sql<number>`
          CASE
            WHEN (${nftsDataSql.saleCount30dComparison}) = 0 THEN NULL
            ELSE ( (${nftsDataSql.saleCount30d}::numeric - ${nftsDataSql.saleCount30dComparison}::numeric)
                  / NULLIF(${nftsDataSql.saleCount30dComparison}::numeric, 0) ) * 100
          END
        `.as("sale_count_30d_percentage_change")
            })
            .from(nft)
            .innerJoin(collection, eq(collection.address, nft.collection))
            .leftJoin(
                nftListing,
                and(eq(nftListing.nft, nft.id), isNull(nftListing.unlistedBlockHeight))
            )
            .leftJoin(nftsDataSql, eq(nft.id, nftsDataSql.nftId))
            .where(nftFilterFn)
    );


    const tokenIdNumericAsc = asc(sql`${nftsStatsSql.tokenId}::numeric`);
    const tokenIdNumericDesc = desc(sql`${nftsStatsSql.tokenId}::numeric`);
    const tokenIdAlphaAsc = asc(nftsStatsSql.tokenId);
    const tokenIdAlphaDesc = desc(nftsStatsSql.tokenId);

    const sortMapping: Record<string, any> = {
        priceAsc: asc(nftsStatsSql.forSalePrice),
        priceDesc: desc(nftsStatsSql.forSalePrice),
        tokenIdAsc: tokenIdNumericAsc,
        tokenIdDesc: tokenIdNumericDesc,
        tokenIdAlphaAsc,
        tokenIdAlphaDesc,
        saleCountAsc: asc(nftsStatsSql.saleCount),
        saleCountDesc: desc(nftsStatsSql.saleCount),
        saleCount24hAsc: asc(nftsStatsSql.saleCount24h),
        saleCount24hDesc: desc(nftsStatsSql.saleCount24h),
        saleCount7dAsc: asc(nftsStatsSql.saleCount7d),
        saleCount7dDesc: desc(nftsStatsSql.saleCount7d),
        saleCount30dAsc: asc(nftsStatsSql.saleCount30d),
        saleCount30dDesc: desc(nftsStatsSql.saleCount30d),
        saleCount24hPercentageChangeAsc: asc(nftsStatsSql.saleCount24hPercentageChange),
        saleCount24hPercentageChangeDesc: desc(nftsStatsSql.saleCount24hPercentageChange),
        saleCount7dPercentageChangeAsc: asc(nftsStatsSql.saleCount7dPercentageChange),
        saleCount7dPercentageChangeDesc: desc(nftsStatsSql.saleCount7dPercentageChange),
        saleCount30dPercentageChangeAsc: asc(nftsStatsSql.saleCount30dPercentageChange),
        saleCount30dPercentageChangeDesc: desc(nftsStatsSql.saleCount30dPercentageChange)
    };

    const sortFn = sortMapping[sort] || tokenIdNumericAsc;

    const nfts = await db
        .with(nftsStatsSql)
        .select()
        .from(nftsStatsSql)
        .orderBy(sortFn)
        .offset(skip)
        .limit(limit);

    return { nfts, totalCount };
}
