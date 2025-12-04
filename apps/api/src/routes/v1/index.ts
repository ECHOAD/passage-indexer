import collections from "./collections/collections";
import collectionById from "./collections/collectionById";
import collectionNfts from "./collections/nfts";
import collectionNftById from "./collections/nftById";
import nftsByOwner from "./accounts/nfts";
import accountSummary from "./accounts/summary";
import orders from "./accounts/orders";
import nfts from "./nfts/nfts";
import ecosystems from "./ecosystems/ecosystems";
import collectionTraits from "./collections/collectionTraits";
import collectionTraitsStats from "./collections/collectionTraitsStats";
import statsSummary from "./stats/summary";
import graph from "./stats/graph";
import staking from "./staking";

export default [collections, collectionById, collectionNfts, collectionNftById, nftsByOwner, accountSummary, orders, nfts, ecosystems, collectionTraits, collectionTraitsStats, statsSummary, graph, staking];
