import {TransactionEventAttribute, TransactionEventWithAttributes} from "database";

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
    return event?.attributes.find((attr) => attr.key === attributeKey && attr.value)?.value ?? null;
}

/** Helpers */
const getFirstAttr = (
    attrs: TransactionEventAttribute[],
    key: string
): string | undefined =>
    attrs.find(a => a.key === key)?.value ?? undefined;

/**
 * Returns all attributes for a given key,
 * skipping null values and typing them as `string`.
 */
const getAllAttr = (
    attrs: TransactionEventAttribute[],
    key: string
): { value: string; attrIdx: number }[] =>
    attrs
        .map((a, i) => ({ ...a, __attrIdx: (a as any).index ?? i }))
        .filter(a => a.key === key && a.value != null)
        .map(a => ({ value: a.value as string, attrIdx: a.__attrIdx as number }));

/**
 * Extracts `{ cw721, minter }` when the CW721 contract address
 * comes from the `reply` event.
 *
 * Logic:
 * - CW721 is taken from the `reply` event (`_contract_address`).
 * - Minter is the other `_contract_address` found in the `instantiate` events
 *   within the same message.
 * - If a `wasm` event with `action=instantiate_cw721_reply` exists,
 *   its `_contract_address` is used as the minter directly.
 */
export function extractMinterAndCw721OnInstantiateReply(
    events: TransactionEventWithAttributes[]
): { cw721: string; minter: string } {

  // 1) CW721 via reply
  const cw721 = events
      .filter(e => e.type === 'reply')
      .map(e => getFirstAttr(e.attributes, '_contract_address'))
      .find(Boolean)

  if (!cw721)
    throw new Error('CW721 not found in reply event for this message.')

  // 2) Minter candidates: instantiate addresses different from CW721
  const instantiates = events
      .filter(e => e.type === 'instantiate')
      .map(e => ({ address: getFirstAttr(e.attributes, '_contract_address'), idx: e.index }))
      .filter(x => x.address && x.address !== cw721) as { address: string; idx: number }[]

  if (instantiates.length === 0)
    throw new Error('No instantiate event different from CW721 (minter) found in this message.')

  if (instantiates.length === 1)
    return { cw721, minter: instantiates[0].address }

  // 3) Disambiguate with anchor: wasm action "instantiate_cw721_reply" is emitted by MINTER
  const minterAnchorIdx = events
      .filter(e => e.type === 'wasm' && getFirstAttr(e.attributes, 'action') === 'instantiate_cw721_reply')
      .map(e => e.index)
      .sort((a,b) => a - b)[0]

  if (minterAnchorIdx !== undefined) {
    const candidate = instantiates
        .filter(i => i.idx <= minterAnchorIdx)
        .sort((a, b) => b.idx - a.idx)[0]
    if (candidate) return { cw721, minter: candidate.address }
  }

  throw new Error('Ambiguity resolving minter without code_id; multiple instantiate candidates.')
}