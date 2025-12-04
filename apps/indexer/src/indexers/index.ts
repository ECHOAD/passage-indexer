import { activeChain } from "@src/shared/constants";
import { Indexer } from "./indexer";
import { MessageAddressesIndexer } from "./messageAddressesIndexer";
import { ValidatorIndexer } from "./validatorIndexer";
import { ContractIndexer } from "./contractIndexer";
import { StakingIndexer } from "./stakingIndexer";

const validatorIndexer = new ValidatorIndexer();
const messageAddressesIndexer = new MessageAddressesIndexer();
const contractIndexer = new ContractIndexer();
const stakingIndexer = new StakingIndexer();

const customIndexers = [contractIndexer, stakingIndexer];

export const indexers: Indexer[] = activeChain.startHeight
  ? [...customIndexers, messageAddressesIndexer, ]
  : [...customIndexers, validatorIndexer, messageAddressesIndexer];
export const activeIndexers = [...indexers];
export const indexersMsgTypes: string[] = activeIndexers.reduce((previous, current) => previous.concat(Object.keys(current.msgHandlers)), [] as string[]);
