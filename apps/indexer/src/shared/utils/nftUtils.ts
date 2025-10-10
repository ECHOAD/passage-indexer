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


const byMsg = (events: TransactionEventWithAttributes[], msgIndex?: number) =>
    (msgIndex ?? msgIndex === 0) ? events.filter(e => e.msgIndex === msgIndex) : events

const get = (attrs: TransactionEventAttribute[], key: string) => attrs.find(a => a.key === key)?.value

/**
 * Extracts the Minter and CW721 contract addresses from a MsgInstantiateContract event,
 * without relying on code IDs.
 *
 * Logic:
 *  - The Minter contract address always appears in the `reply` event.
 *  - The CW721 contract address is the other `instantiate` event in the same message.
 *  - If there are multiple `instantiate` events, we choose the one that occurred
 *    right before the Minter’s `instantiate_cw721_reply` wasm event.
 *
 * This approach is reliable for both testnet and mainnet where code IDs may differ.
 */
export function extractMinterAndCw721OnInstantiateReply(
    allEvents: TransactionEventWithAttributes[],
    msgIndex: number | undefined
): { minter: string; cw721: string } {
  const events = byMsg(allEvents, msgIndex)

  // 1️⃣ Identify the minter via the reply event
  const minter = events
      .filter(e => e.type === 'reply')
      .map(e => get(e.attributes, '_contract_address'))
      .find(Boolean)

  if (!minter)
    throw new Error('Minter not found in reply event for this message.')

  // 2️⃣ Find all instantiate events with a different address than the minter
  const instantiates = events
      .filter(e => e.type === 'instantiate')
      .map(e => ({ address: get(e.attributes, '_contract_address'), idx: e.index }))
      .filter(x => x.address && x.address !== minter) as { address: string; idx: number }[]

  if (instantiates.length === 0) {
    throw new Error('No instantiate event found different from minter (CW721) in this message.')
  }
  if (instantiates.length === 1) {
    return { minter, cw721: instantiates[0].address }
  }

  // 3️⃣ Disambiguate using the wasm "instantiate_cw721_reply" event of the minter
  const replyAnchorIdx = events
      .filter(e => e.type === 'wasm' && get(e.attributes, '_contract_address') === minter)
      .find(e => get(e.attributes, 'action') === 'instantiate_cw721_reply')
      ?.index

  if (replyAnchorIdx !== undefined) {
    const candidate = instantiates
        .filter(i => i.idx <= replyAnchorIdx)
        .sort((a, b) => b.idx - a.idx)[0]

    if (candidate) return { minter, cw721: candidate.address }
  }

  // 4️⃣ Fallback: throw if multiple ambiguous instantiate events exist
  throw new Error('Ambiguity when resolving CW721 without code_id; multiple instantiate candidates found.')
}