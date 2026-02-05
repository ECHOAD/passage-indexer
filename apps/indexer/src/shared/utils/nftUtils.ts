import {TransactionEventAttribute, TransactionEventWithAttributes} from "database";

// Sometimes the tokendId has leading zeros, this function removes them
export function parseTokenId(tokenId: string) {
  return parseInt(tokenId);
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
  if (!events?.length) throw new Error("No events provided.");

  // --- Restrict search to the same msgIndex as the reply event
  const replyEvt = events.find(e => e.type === "reply");
  if (!replyEvt) throw new Error("CW721 not found: no 'reply' event.");
  const scopeMsgIndex = replyEvt.msgIndex;

  const sameMsg = events.filter(e => e.msgIndex === scopeMsgIndex);

  // 1️⃣ CW721 comes from the reply event
  const minter =
      sameMsg
          .filter(e => e.type === "reply")
          .map(e => getFirstAttr(e.attributes, "_contract_address"))
          .find(Boolean) ?? undefined;

  if (!minter) {
    throw new Error("CW721 not found in 'reply' event for this message.");
  }

  // 2️⃣ Try to detect the minter directly via wasm anchor
  const wasmAnchor = sameMsg.find(
      e =>
          e.type === "wasm" &&
          getFirstAttr(e.attributes, "action") === "instantiate_cw721_reply"
  );
  const cw721 = wasmAnchor
      ? getFirstAttr(wasmAnchor.attributes, "_contract_address")
      : undefined;

  // 3️⃣ Collect all instantiate candidates (different from cw721)
  type CandidateMinter = { address: string; evIdx: number; attrIdx: number };
  const instantiateCandidates: CandidateMinter[] = sameMsg
      .filter(e => e.type === "instantiate")
      .flatMap(e =>
          getAllAttr(e.attributes, "_contract_address").map(a => ({
            address: a.value,
            evIdx: e.index,
            attrIdx: a.attrIdx,
          }))
      )
      .filter(c => c.address !== minter);

  // Remove duplicates by address, keeping the first one chronologically
  const seen = new Set<string>();
  const uniqueCandidates: CandidateMinter[] = instantiateCandidates.filter(c => {
    if (seen.has(c.address)) return false;
    seen.add(c.address);
    return true;
  });

  // 4️⃣ If wasm anchor was found, use it as the minter (most reliable source)
  if (cw721) {
    return { cw721: cw721, minter: minter };
  }

  // 5️⃣ Fallback to instantiate candidates
  if (uniqueCandidates.length === 0) {
    throw new Error("No instantiate candidate different from CW721 (minter) found.");
  }

  if (uniqueCandidates.length === 1) {
    return { cw721: uniqueCandidates[0].address, minter: minter  };
  }

  // 6️⃣ Final fallback: pick the first in chronological order
  const fallback = uniqueCandidates
      .sort((a, b) => (a.evIdx - b.evIdx) || (a.attrIdx - b.attrIdx))[0];

  if (fallback) return { cw721: fallback.address , minter:minter  };

  throw new Error(
      "Ambiguity when resolving minter without anchor; multiple instantiate candidates found."
  );
}
