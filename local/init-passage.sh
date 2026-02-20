#!/bin/bash
set -e

# ============================================================
#  Passage Local Testnet - Node Init & Start Script
#  - First run: initializes chain, creates funded wallet
#  - Subsequent runs: prints wallet info and resumes node
#  - Always prints seed phrase so you can send transactions
# ============================================================

CHAIN_ID="localpassage-1"
MONIKER="local-node"
KEY_NAME="localwallet"
KEYRING="test"
PASSAGE_HOME="/root/.passage"

# Fixed mnemonic for reproducibility.
# NEVER use this in production - it is publicly known!
MNEMONIC="notice oak worry limit wrap speak medal online prefer cluster roof addict wrist behave treat actual wasp year salad speed social layer crew genius"

# Genesis balances
INITIAL_BALANCE="100000000000upasg"   # 100,000 PASG (in micro)
STAKE_AMOUNT="10000000000upasg"        # 10,000 PASG as validator stake

# ── Helpers ──────────────────────────────────────────────────

print_separator() {
    echo "============================================================"
}

print_wallet_info() {
    ADDRESS=$(passage keys show "$KEY_NAME" -a --keyring-backend "$KEYRING" --home "$PASSAGE_HOME" 2>/dev/null || echo "N/A")
    echo ""
    print_separator
    echo "  PASSAGE LOCAL NODE - WALLET INFO"
    print_separator
    echo ""
    echo "  Key name  : $KEY_NAME"
    echo "  Address   : $ADDRESS"
    echo "  Chain ID  : $CHAIN_ID"
    echo "  Balance   : 100000000000 upasg  (100,000 PASG)"
    echo ""
    echo "  SEED PHRASE  (use this to import the wallet):"
    print_separator
    echo "  $MNEMONIC"
    print_separator
    echo ""
    echo "  Endpoints:"
    echo "    RPC      -> http://localhost:26657"
    echo "    REST API -> http://localhost:1317"
    echo "    gRPC     -> localhost:9090"
    echo ""
    print_separator
    echo ""
}

# ── First-run initialization ──────────────────────────────────

if [ ! -f "$PASSAGE_HOME/config/genesis.json" ]; then

    echo ""
    print_separator
    echo "  First run detected - initializing chain..."
    print_separator
    echo ""

    # 1. Init node
    passage init "$MONIKER" --chain-id "$CHAIN_ID" --home "$PASSAGE_HOME"

    # 2. Patch genesis: Cosmos SDK defaults bond_denom to "stake".
    #    Passage uses "upasg", so update every module that references the denom
    #    before running gentx (otherwise gentx rejects the coin denomination).
    echo ">>> Patching genesis bond denom (stake -> upasg)..."
    GENESIS="$PASSAGE_HOME/config/genesis.json"
    jq '
      .app_state.staking.params.bond_denom       = "upasg" |
      .app_state.mint.params.mint_denom           = "upasg" |
      .app_state.crisis.constant_fee.denom        = "upasg" |
      .app_state.gov.deposit_params.min_deposit   = [{"denom":"upasg","amount":"10000000"}]
    ' "$GENESIS" > /tmp/genesis_patched.json
    mv /tmp/genesis_patched.json "$GENESIS"

    # 3. Import wallet from fixed mnemonic
    echo ">>> Creating test wallet from fixed mnemonic..."
    echo "$MNEMONIC" | passage keys add "$KEY_NAME" \
        --keyring-backend "$KEYRING" \
        --home "$PASSAGE_HOME" \
        --recover

    ADDRESS=$(passage keys show "$KEY_NAME" -a --keyring-backend "$KEYRING" --home "$PASSAGE_HOME")
    echo "    Address: $ADDRESS"

    # 4. Fund genesis account
    echo ">>> Adding genesis account with $INITIAL_BALANCE..."
    passage add-genesis-account "$ADDRESS" "$INITIAL_BALANCE" \
        --keyring-backend "$KEYRING" \
        --home "$PASSAGE_HOME"

    # 5. Genesis validator tx
    echo ">>> Creating genesis validator tx (stake: $STAKE_AMOUNT)..."
    passage gentx "$KEY_NAME" "$STAKE_AMOUNT" \
        --chain-id "$CHAIN_ID" \
        --keyring-backend "$KEYRING" \
        --home "$PASSAGE_HOME"

    # 6. Collect gentxs
    passage collect-gentxs --home "$PASSAGE_HOME"

    # 7. Validate genesis
    passage validate-genesis --home "$PASSAGE_HOME"

    # ── Tune config.toml ──────────────────────────────────────
    CONFIG="$PASSAGE_HOME/config/config.toml"

    # RPC: listen on all interfaces so Docker can reach it
    sed -i 's|laddr = "tcp://127.0.0.1:26657"|laddr = "tcp://0.0.0.0:26657"|g' "$CONFIG"

    # Allow all CORS origins (needed for browser / external clients)
    sed -i 's|cors_allowed_origins = \[\]|cors_allowed_origins = ["*"]|g' "$CONFIG"

    # Faster blocks for local testing (~2 s block time)
    sed -i 's|timeout_propose = "3s"|timeout_propose = "1s"|g'   "$CONFIG"
    sed -i 's|timeout_commit = "5s"|timeout_commit = "1s"|g'     "$CONFIG"

    # ── Tune app.toml ─────────────────────────────────────────
    APP_CONFIG="$PASSAGE_HOME/config/app.toml"

    # Enable REST API
    sed -i '/\[api\]/,/\[/{s/enable = false/enable = true/}' "$APP_CONFIG"

    # Enable Swagger UI on REST
    sed -i '/\[api\]/,/\[/{s/swagger = false/swagger = true/}' "$APP_CONFIG"

    # REST API: bind on all interfaces
    sed -i 's|address = "tcp://localhost:1317"|address = "tcp://0.0.0.0:1317"|g' "$APP_CONFIG"

    echo ""
    echo ">>> Chain initialized successfully!"

else
    echo ""
    echo ">>> Existing chain data found - resuming node..."
fi

# ── Always print wallet info before starting ─────────────────
print_wallet_info

echo ">>> Starting Passage node (chain: $CHAIN_ID)..."
echo ""

exec passage start \
    --home "$PASSAGE_HOME" \
    --minimum-gas-prices "0upasg" \
    --log_level info
