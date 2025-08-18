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
    ...stats
  };
}
