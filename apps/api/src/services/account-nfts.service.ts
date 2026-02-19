import {
  and,
  asc,
  collection,
  count,
  db,
  desc,
  eq,
  isNull,
  notInArray,
  nft,
  nftAuction,
  nftListing,
  sql
} from "database";
import { IGNORED_COLLECTIONS } from "@src/utils/constants";

export type AccountNftsSort = "tokenIdAsc" | "tokenIdDesc" | "priceAsc" | "priceDesc";

export async function getAccountNfts({
                                       ownerAddress,
                                       collectionAddress,
                                       saleType,         // "FIXED_PRICE" | "NOT_FOR_SALE" | string | undefined
                                       sort,             // AccountNftsSort
                                       skip,
                                       limit,
                                       minPrice,
                                       maxPrice
                                     }: {
  ownerAddress: string;
  collectionAddress?: string;
  saleType?: "FIXED_PRICE" | "LIVE_AUCTION" | "NOT_FOR_SALE" | string;
  sort: AccountNftsSort;
  skip: number;
  limit: number;
  minPrice?: number | null;
  maxPrice?: number | null;
}) {
  const hasOpenListingExists = sql<boolean>`
    EXISTS (
      SELECT 1
      FROM ${nftListing}
      WHERE ${nftListing.nft} = ${nft.id}
      AND ${nftListing.unlistedBlockHeight} IS NULL
    )
  `;
  const hasActiveAuctionExists = sql<boolean>`
    EXISTS (
      SELECT 1
      FROM ${nftAuction}
      WHERE ${nftAuction.nftId} = ${nft.id}
      AND ${nftAuction.status} = 'active'
    )
  `;
  const noActiveSaleExists = sql<boolean>`NOT (${hasOpenListingExists} OR ${hasActiveAuctionExists})`;

  const minPriceCondition =
      typeof minPrice === "number"
          ? sql<boolean>`
          EXISTS (
            SELECT 1
            FROM ${nftListing}
            WHERE ${nftListing.nft} = ${nft.id}
              AND ${nftListing.unlistedBlockHeight} IS NULL
              AND ${nftListing.forSalePrice} >= ${minPrice}
          )
        `
          : undefined;

  const maxPriceCondition =
      typeof maxPrice === "number"
          ? sql<boolean>`
          EXISTS (
            SELECT 1
            FROM ${nftListing}
            WHERE ${nftListing.nft} = ${nft.id}
              AND ${nftListing.unlistedBlockHeight} IS NULL
              AND ${nftListing.forSalePrice} <= ${maxPrice}
          )
        `
          : undefined;

  const baseWhere = and(
      eq(nft.owner, ownerAddress),
      notInArray(nft.collection, IGNORED_COLLECTIONS),
      collectionAddress ? eq(nft.collection, collectionAddress) : undefined,
      saleType === "FIXED_PRICE" ? hasOpenListingExists : undefined,
      saleType === "LIVE_AUCTION" ? hasActiveAuctionExists : undefined,
      saleType === "NOT_FOR_SALE" ? noActiveSaleExists : undefined,
      minPriceCondition,
      maxPriceCondition
  );

  const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(nft)
      .where(baseWhere);

  const tokenIdNumericAsc = asc(sql`${nft.tokenId}::numeric`);
  const tokenIdNumericDesc = desc(sql`${nft.tokenId}::numeric`);
  const sortMapping: Record<AccountNftsSort, any> = {
    tokenIdAsc: tokenIdNumericAsc,
    tokenIdDesc: tokenIdNumericDesc,
    priceAsc: asc(nftListing.forSalePrice),
    priceDesc: desc(nftListing.forSalePrice),
  };
  const sortFn = sortMapping[sort] ?? tokenIdNumericAsc;

  const rows = await db
      .select({
        tokenId: nft.rawTokenId,
        owner: nft.owner,
        collectionAddress: nft.collection,
        collectionName: collection.name,
        metadata: nft.metadata,
        createdOnBlockHeight: nft.createdOnBlockHeight,
        mintedOnBlockHeight: nft.mintedOnBlockHeight,
        mintPrice: nft.mintPrice,
        mintDenom: nft.mintDenom,
        listedPrice: nftListing.forSalePrice,
        listedDenom: nftListing.forSaleDenom,
        listedRawTokenId: nftListing.rawTokenId,
      })
      .from(nft)
      .leftJoin(
          nftListing,
          and(eq(nftListing.nft, nft.id), isNull(nftListing.unlistedBlockHeight))
      )
      .innerJoin(collection, eq(collection.address, nft.collection))
      .where(baseWhere)
      .orderBy(sortFn)
      .offset(skip)
      .limit(limit);

  return {
    nfts: rows.map(r => ({
      tokenId: r.tokenId,
      owner: r.owner,
      collection: {
        address: r.collectionAddress,
        name: r.collectionName
      },
      metadata: r.metadata,
      createdOnBlockHeight: r.createdOnBlockHeight,
      mintedOnBlockHeight: r.mintedOnBlockHeight,
      mintPrice: r.mintPrice,
      mintDenom: r.mintDenom,
      listedPrice: r.listedPrice ?? null,
      listedDenom: r.listedDenom ?? null,
      listedRawTokenId: r.listedRawTokenId ?? null,
    })),
    totalCount
  };
}
