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
export function getEventAttributeValue(events: TransactionEventWithAttributes[], eventType: TxEventType, attributeKey: string) {
    const event = events.find((event) => event.type === eventType);
    return event?.attributes.find((attr) => attr.key === attributeKey)?.value ?? null;
}


type EventAttributeSearch = {
    eventType: TxEventType;
    attributeKeys: string[];
};

export function getEventsAttributeValuesGrouped(
    events: TransactionEventWithAttributes[],
    searchParams: EventAttributeSearch[]
): Array<Record<string, Record<string, string | null>>> {
    const result: Array<Record<string, Record<string, string | null>>> = [];

    for (const { eventType, attributeKeys } of searchParams) {
        const matchingEvents = events.filter((e) => e.type === eventType);

        for (const event of matchingEvents) {
            const attributesMap: Record<string, string | null> = {};

            for (const key of attributeKeys) {
                const attr = event.attributes.find((a) => a.key === key);
                attributesMap[key] = attr?.value ?? null;
            }

            result.push({ [eventType]: attributesMap });
        }
    }

    return result;
}