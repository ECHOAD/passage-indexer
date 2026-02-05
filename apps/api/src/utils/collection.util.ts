import { getCollectionStats } from "@src/services/collection.service";
import { Collection } from "database";

export async function mapCollection(collection: Collection, statsPeriod?: "24h" | "7d" | "30d") {
  const stats = await getCollectionStats(collection.address, undefined, statsPeriod );

  return {
    address: collection.address,
    createdHeight: collection.createdHeight,
    name: collection.name,
    symbol: collection.symbol,
    mintContract: collection.mintContract,
    marketContract: collection.marketContract,
    marketDenom: collection.marketDenom,
    minter: collection.minter,
    creator: collection.creator,
    description: collection.description,
    image: collection.image,
    externalLink: collection.externalLink,
    royaltyAddress: collection.royaltyAddress,
    royaltyFee: collection.royaltyFee,
    maxNumToken: collection.maxNumToken,
    perAddressLimit: collection.perAddressLimit,
    startTime: collection.startTime,
    unitPrice: collection.unitPrice,
    unitDenom: collection.unitDenom,
    collectorAddress: collection.collectorAddress,
    tradingFeeBps: collection.tradingFeeBps,
    minPrice: collection.minPrice,
    auctionContract: collection.auctionContract,
    auctionDenom: collection.auctionDenom,
    auctionCollectorAddress: collection.auctionCollectorAddress,
    auctionTradingFeeBps: collection.auctionTradingFeeBps,
    auctionMinPrice: collection.auctionMinPrice,
    auctionMinBidIncrement: collection.auctionMinBidIncrement,
    auctionMinDuration: collection.auctionMinDuration,
    auctionMaxDuration: collection.auctionMaxDuration,
    auctionClosedDuration: collection.auctionClosedDuration,
    auctionBufferDuration: collection.auctionBufferDuration,
    ...stats
  };
}
