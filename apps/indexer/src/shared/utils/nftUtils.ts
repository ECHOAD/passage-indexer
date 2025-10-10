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
 * Devuelve SOLO valores no nulos para `key`,
 * tipados como `string` (no `string | null`).
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
 * Extrae { minter, cw721 } sin depender de code_id.
 * - El minter se toma del evento `reply` (su _contract_address).
 * - El cw721 es el otro `_contract_address` dentro de los `instantiate` del mismo mensaje.
 * - Si hay ambigüedad, usa el ancla `wasm` con `action=instantiate_cw721_reply` del minter.
 */
export function extractMinterAndCw721OnInstantiateReply(
    events: TransactionEventWithAttributes[]
): { minter: string; cw721: string } {
  if (!events?.length) throw new Error("No events provided.");

  // --- limitamos el scope al mismo msgIndex del reply (por seguridad)
  const replyEvt = events.find(e => e.type === "reply");
  if (!replyEvt) throw new Error("Minter not found: no 'reply' event.");
  const scopeMsgIndex = replyEvt.msgIndex;

  const sameMsg = events.filter(e => e.msgIndex === scopeMsgIndex);

  // 1️⃣ MINTER
  const minter =
      sameMsg
          .filter(e => e.type === "reply")
          .map(e => getFirstAttr(e.attributes, "_contract_address"))
          .find(Boolean) ?? undefined;

  if (!minter) {
    throw new Error("Minter not found in 'reply' event for this message.");
  }

  // 2️⃣ CANDIDATOS CW721 (no nulos gracias a getAllAttr)
  type CandidateCW721 = { address: string; evIdx: number; attrIdx: number };

  const instantiateCandidates: CandidateCW721[] = sameMsg
      .filter(e => e.type === "instantiate")
      .flatMap(e =>
          getAllAttr(e.attributes, "_contract_address").map(a => ({
            address: a.value,           // <-- ya es string (no null)
            evIdx: e.index,
            attrIdx: a.attrIdx,
          }))
      )
      .filter(c => c.address !== minter);

  // quitar duplicados por address manteniendo el primero cronológico
  const seen = new Set<string>();
  const uniqueCandidates: CandidateCW721[] = instantiateCandidates.filter(c => {
    if (seen.has(c.address)) return false;
    seen.add(c.address);
    return true;
  });

  if (uniqueCandidates.length === 0) {
    throw new Error(
        "No instantiate candidate different from minter (CW721) in this message."
    );
  }

  if (uniqueCandidates.length === 1) {
    return { minter, cw721: uniqueCandidates[0].address };
  }

  // 3️⃣ ANCLA: wasm del minter con action=instantiate_cw721_reply
  const wasmAnchor = sameMsg.find(
      e =>
          e.type === "wasm" &&
          getFirstAttr(e.attributes, "_contract_address") === minter &&
          getFirstAttr(e.attributes, "action") === "instantiate_cw721_reply"
  );

  if (wasmAnchor) {
    // Elegimos el candidato cuya posición sea la última <= a la del ancla.
    const best = uniqueCandidates
        .filter(c => c.evIdx <= wasmAnchor.index)
        .sort((a, b) => (b.evIdx - a.evIdx) || (b.attrIdx - a.attrIdx))[0];

    if (best) return { minter, cw721: best.address };
  }

  // 4️⃣ Fallback robusto: primero en orden cronológico
  const fallback = uniqueCandidates
      .sort((a, b) => (a.evIdx - b.evIdx) || (a.attrIdx - b.attrIdx))[0];

  if (fallback) return { minter, cw721: fallback.address };

  throw new Error(
      "Ambiguity when resolving CW721 without code_id; multiple instantiate candidates found."
  );
}