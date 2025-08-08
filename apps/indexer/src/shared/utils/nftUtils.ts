import { TransactionEventWithAttributes } from "database";

// Sometimes the tokendId has leading zeros, this function removes them
export function parseTokenId(tokenId: string) {
  return parseInt(tokenId);
}

type TxEventType =
  | "transfer"
  | "coin_spent"
  | "instantiate"
  | "wasm"
  | "wasm-accept-bid"
  | "wasm-set-ask"
  | "wasm-remove-ask"
  | "wasm-set-bid"
  | "wasm-remove-bid"
  | "wasm-match-bid"
  | "wasm-set-collection-bid"
  | "wasm-remove-collection-bid"
  | "wasm-accept-collection-bid"
  | "wasm-finalize-sale"
  | "wasm-payout-market"
  | "wasm-payout-royalty"
  | "wasm-payout-seller"
  | "wasm-refund-bidder";
export function getEventAttributeValue(
    events: TransactionEventWithAttributes[],
    eventType: TxEventType,
    attributeKey: string,
    index?: number
) {
    const event = events.find((event) =>
        event.type === eventType && (index === undefined || event.index === index)
    );

    return event?.attributes.find((attr) => attr.key === attributeKey)?.value ?? null;
}
