import {
  db,
  eq,
  nft,
  collection,
  nftBid,
  isNull,
  and,
  nftCollectionBid,
  inArray,
  NftBid,
  Collection,
  Nft,
  Block,
  NftCollectionBid,
  block
} from "database";

type MappedBidType = {
  nft: {
    tokenId: number;
    owner: string;
    metadata: any;
    createdOnBlockHeight: number;
    mintedOnBlockHeight: number;
    mintPrice: string;
    mintDenom: string;
  } | null;
  collection: {
    address: string;
    name: string;
    image: string;
  };
  rawTokenId: string | null;
  price: string;
  denom: string;
  createdHeight: number;
  createdDatetime: Date;
  createdByAddress: string;
};

export async function getReceivedBids(owner: string): Promise<MappedBidType[]> {
  const nftBids = await db
    .select()
    .from(nftBid)
    .innerJoin(nft, eq(nftBid.nft, nft.id))
    .innerJoin(block, eq(nftBid.bidBlockHeight, block.height))
    .innerJoin(collection, eq(nft.collection, collection.address))
    .where(and(eq(nft.owner, owner), isNull(nftBid.removedBlockHeight)));

  const ownedCollections = (await db.selectDistinctOn([nft.collection]).from(nft).where(eq(nft.owner, owner))).map((x) => x.collection);

  const collectionBids = await db.query.nftCollectionBid.findMany({
    where: and(inArray(nftCollectionBid.collection, ownedCollections), isNull(nftCollectionBid.removedBlockHeight)),
    with: {
      collection: true,
      block: true
    }
  });

  const mappedNftBids = nftBids.map((bid) => mapBid(bid.nft_bid, bid.block, bid.nft, bid.collection));
  const mappedCollectionBids = collectionBids.map((bid) => mapBid(bid, bid.block, null, bid.collection));

  const allBids = [...mappedNftBids, ...mappedCollectionBids];

  allBids.sort((a, b) => b.createdHeight - a.createdHeight);

  return allBids;
}

export async function getCreatedBids(owner: string): Promise<MappedBidType[]> {
  const nftBids = await db.query.nftBid.findMany({
    where: and(eq(nftBid.owner, owner), isNull(nftBid.removedBlockHeight)),
    with: {
      nft: {
        with: {
          collection: true
        }
      },
      block: true
    }
  });

  const collectionBids = await db.query.nftCollectionBid.findMany({
    where: and(eq(nftCollectionBid.owner, owner), isNull(nftCollectionBid.removedBlockHeight)),
    with: {
      collection: true,
      block: true
    }
  });

  const mappedNftBids = nftBids.map((bid) => mapBid(bid, bid.block, bid.nft, bid.nft.collection));
  const mappedCollectionBids = collectionBids.map((bid) => mapBid(bid, bid.block, null, bid.collection));

  const allBids = [...mappedNftBids, ...mappedCollectionBids];

  allBids.sort((a, b) => b.createdHeight - a.createdHeight);

  return allBids;
}

function isNftBid(bid: NftBid | NftCollectionBid): bid is NftBid {
  return "rawTokenId" in bid;
}

function mapBid(
    bid: NftBid | NftCollectionBid,
    block: Block,
    nft: Nft | null,
    collection: Collection
): MappedBidType {
  return {
    nft: nft
        ? {
          tokenId: nft.tokenId,
          owner: nft.owner,
          metadata: nft.metadata,
          createdOnBlockHeight: nft.createdOnBlockHeight,
          mintedOnBlockHeight: nft.mintedOnBlockHeight,
          mintPrice: nft.mintPrice,
          mintDenom: nft.mintDenom
        }
        : null,
    collection: {
      address: collection.address,
      name: collection.name,
      image: collection.image
    },
    rawTokenId: isNftBid(bid) ? bid.rawTokenId : null,
    price: bid.bidPrice,
    denom: bid.bidDenom,
    createdHeight: block.height,
    createdDatetime: block.datetime,
    createdByAddress: bid.owner
  };
}
