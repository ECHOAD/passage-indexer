import { TransactionEventAttribute, TransactionEventWithAttributes } from "database";

// Sometimes the tokenId has leading zeros, this function removes them.
export function parseTokenId(tokenId: string | number) {
  if (typeof tokenId === "number") {
    return Number.isInteger(tokenId) && tokenId >= 0 ? tokenId : NaN;
  }

  const normalized = tokenId.trim();
  if (!/^\d+$/.test(normalized)) return NaN;

  return Number.parseInt(normalized, 10);
}

type TxEventType =
  | "transfer"
  | "coin_spent"
  | "coin_received"
  | "instantiate"
  | "execute"
  | "message"
  | "wasm";

const WASM_EVENT_PREFIX = "wasm-";

function getEventTypeCandidates(eventType: string): string[] {
  if (eventType === "wasm" || eventType === "instantiate" || eventType === "execute" || eventType === "message") {
    return [eventType];
  }

  if (eventType.startsWith(WASM_EVENT_PREFIX)) {
    return [eventType, eventType.slice(WASM_EVENT_PREFIX.length)];
  }

  return [eventType, `${WASM_EVENT_PREFIX}${eventType}`];
}

function findEventByType(
  events: TransactionEventWithAttributes[],
  eventType: string
): TransactionEventWithAttributes | undefined {
  const candidates = getEventTypeCandidates(eventType);
  const direct = events.find((event) => candidates.includes(event.type));
  if (direct) return direct;

  if (!candidates.includes("wasm")) {
    return events.find((event) => {
      if (event.type !== "wasm") return false;
      const action = event.attributes.find((attr) => attr.key === "action")?.value;
      return action ? candidates.includes(action) : false;
    });
  }

  return undefined;
}

export function findEventsByType(
  events: TransactionEventWithAttributes[],
  eventType: string
): TransactionEventWithAttributes[] {
  const candidates = getEventTypeCandidates(eventType);
  const direct = events.filter((event) => candidates.includes(event.type));
  if (direct.length > 0) return direct;

  if (!candidates.includes("wasm")) {
    return events.filter((event) => {
      if (event.type !== "wasm") return false;
      const action = event.attributes.find((attr) => attr.key === "action")?.value;
      return action ? candidates.includes(action) : false;
    });
  }

  return [];
}

export function getEventAttributeValue(
  events: TransactionEventWithAttributes[],
  eventType: TxEventType | string,
  attributeKey: string
) {
  const event = findEventByType(events, eventType);
  return event?.attributes.find((attr) => attr.key === attributeKey && attr.value)?.value ?? null;
}

export function getEventAttributeValues(
  events: TransactionEventWithAttributes[],
  eventType: TxEventType | string,
  attributeKey: string
): string[] {
  const matched = findEventsByType(events, eventType);
  return matched
    .map((event) => event.attributes.find((attr) => attr.key === attributeKey && attr.value)?.value)
    .filter((value): value is string => Boolean(value));
}

const getFirstAttr = (
  attrs: TransactionEventAttribute[],
  key: string
): string | undefined =>
  attrs.find((a) => a.key === key)?.value ?? undefined;

/**
 * Returns all attributes for a given key, skipping null values and typing them as `string`.
 */
const getAllAttr = (
  attrs: TransactionEventAttribute[],
  key: string
): { value: string; attrIdx: number }[] =>
  attrs
    .map((a, i) => ({ ...a, __attrIdx: a.index ?? i }))
    .filter((a) => a.key === key && a.value != null)
    .map((a) => ({ value: a.value as string, attrIdx: a.__attrIdx as number }));

/**
 * Extracts `{ cw721, minter }` when the CW721 contract address comes from the `reply` event.
 *
 * Logic:
 * - CW721 is taken from the `reply` event (`_contract_address`).
 * - Minter is taken from the `wasm` anchor (`action=instantiate_cw721_reply`)
 *   or, as fallback, from `instantiate` events in the same message.
 */
export function extractMinterAndCw721OnInstantiateReply(
  events: TransactionEventWithAttributes[]
): { cw721: string; minter: string } {
  if (!events?.length) throw new Error("No events provided.");

  const replyEvt = events.find((e) => e.type === "reply" && getFirstAttr(e.attributes, "_contract_address"));
  if (!replyEvt) throw new Error("CW721 not found: no 'reply' event.");

  const cw721 = getFirstAttr(replyEvt.attributes, "_contract_address");
  if (!cw721) throw new Error("CW721 not found in 'reply' event for this message.");

  const sameMsg = events.filter((e) => e.msgIndex === replyEvt.msgIndex);

  const wasmAnchor = sameMsg.find(
    (e) => e.type === "wasm" && getFirstAttr(e.attributes, "action") === "instantiate_cw721_reply"
  );
  const minterFromAnchor = wasmAnchor
    ? getFirstAttr(wasmAnchor.attributes, "_contract_address")
    : undefined;

  if (minterFromAnchor) {
    return { cw721, minter: minterFromAnchor };
  }

  type CandidateMinter = { address: string; evIdx: number; attrIdx: number };
  const instantiateCandidates: CandidateMinter[] = sameMsg
    .filter((e) => e.type === "instantiate")
    .flatMap((e) =>
      getAllAttr(e.attributes, "_contract_address").map((a) => ({
        address: a.value,
        evIdx: e.index,
        attrIdx: a.attrIdx
      }))
    )
    .filter((c) => c.address !== cw721);

  const seen = new Set<string>();
  const uniqueCandidates: CandidateMinter[] = instantiateCandidates.filter((c) => {
    if (seen.has(c.address)) return false;
    seen.add(c.address);
    return true;
  });

  const fallback = uniqueCandidates
    .sort((a, b) => (a.evIdx - b.evIdx) || (a.attrIdx - b.attrIdx))[0];

  if (!fallback) {
    throw new Error("Minter address not found in wasm anchor or instantiate events.");
  }

  return { cw721, minter: fallback.address };
}
