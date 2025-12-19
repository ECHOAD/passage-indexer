CREATE TYPE "public"."reward_asset_type" AS ENUM('native', 'cw20');--> statement-breakpoint
CREATE TYPE "public"."staking_event_type" AS ENUM('stake', 'unstake', 'claim', 'claim_rewards', 'create_reward_account');--> statement-breakpoint
CREATE TYPE "public"."staking_snapshot_type" AS ENUM('global_vault', 'global_reward', 'user');--> statement-breakpoint
CREATE TABLE "stake_vault" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" varchar(255) NOT NULL,
	"factory_address" varchar(255) NOT NULL,
	"created_height" integer NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"unstaking_duration_sec" bigint NOT NULL,
	"collections" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stake_vault_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "stake_reward_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" varchar(255) NOT NULL,
	"vault_address" varchar(255) NOT NULL,
	"reward_asset_type" "reward_asset_type" NOT NULL,
	"reward_asset_denom" varchar(255) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"duration_sec" bigint NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"total_funds" numeric(78, 0) NOT NULL,
	"remaining_funds" numeric(78, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stake_reward_account_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "staked_nft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_address" varchar(255) NOT NULL,
	"collection_address" varchar(255) NOT NULL,
	"token_id" varchar(255) NOT NULL,
	"staker_address" varchar(255) NOT NULL,
	"staked_at_height" integer NOT NULL,
	"staked_at" timestamp with time zone NOT NULL,
	"unstaked_at_height" integer,
	"unstaked_at" timestamp with time zone,
	"claimable_at" timestamp with time zone,
	"is_claimed" boolean DEFAULT false NOT NULL,
	"nft_id" uuid
);
--> statement-breakpoint
CREATE TABLE "staking_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_address" varchar(255) NOT NULL,
	"event_type" "staking_event_type" NOT NULL,
	"user_address" varchar(255) NOT NULL,
	"height" integer NOT NULL,
	"transaction_hash" varchar(255) NOT NULL,
	"transaction_id" uuid,
	"block_time" timestamp with time zone NOT NULL,
	"nft_count" integer,
	"reward_account_address" varchar(255),
	"reward_amount" numeric(78, 0),
	"reward_denom" varchar(255),
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "reward_claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reward_account_address" varchar(255) NOT NULL,
	"vault_address" varchar(255) NOT NULL,
	"user_address" varchar(255) NOT NULL,
	"claimed_at_height" integer NOT NULL,
	"claimed_at" timestamp with time zone NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"denom" varchar(255) NOT NULL,
	"staked_amount" numeric(78, 0) NOT NULL,
	"total_staked" numeric(78, 0) NOT NULL,
	"rewards_per_token" numeric(78, 18) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staking_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_type" "staking_snapshot_type" NOT NULL,
	"vault_address" varchar(255) NOT NULL,
	"reward_account_address" varchar(255),
	"snapshot_time" timestamp with time zone NOT NULL,
	"height" integer NOT NULL,
	"total_staked" numeric(78, 0) NOT NULL,
	"total_stakers" integer NOT NULL,
	"total_rewards_distributed" numeric(78, 0) NOT NULL,
	"rewards_per_token" numeric(78, 18) NOT NULL,
	"user_address" varchar(255),
	"user_staked_amount" numeric(78, 0),
	"user_pending_rewards" numeric(78, 0)
);
--> statement-breakpoint
ALTER TABLE "stake_vault" ADD CONSTRAINT "stake_vault_created_height_block_height_fk" FOREIGN KEY ("created_height") REFERENCES "public"."block"("height") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "stake_reward_account" ADD CONSTRAINT "stake_reward_account_vault_address_stake_vault_address_fk" FOREIGN KEY ("vault_address") REFERENCES "public"."stake_vault"("address") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "staked_nft" ADD CONSTRAINT "staked_nft_vault_address_stake_vault_address_fk" FOREIGN KEY ("vault_address") REFERENCES "public"."stake_vault"("address") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "staked_nft" ADD CONSTRAINT "staked_nft_collection_address_collection_address_fk" FOREIGN KEY ("collection_address") REFERENCES "public"."collection"("address") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "staked_nft" ADD CONSTRAINT "staked_nft_staked_at_height_block_height_fk" FOREIGN KEY ("staked_at_height") REFERENCES "public"."block"("height") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "staked_nft" ADD CONSTRAINT "staked_nft_unstaked_at_height_block_height_fk" FOREIGN KEY ("unstaked_at_height") REFERENCES "public"."block"("height") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "staked_nft" ADD CONSTRAINT "staked_nft_nft_id_nft_id_fk" FOREIGN KEY ("nft_id") REFERENCES "public"."nft"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "staking_event" ADD CONSTRAINT "staking_event_vault_address_stake_vault_address_fk" FOREIGN KEY ("vault_address") REFERENCES "public"."stake_vault"("address") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "staking_event" ADD CONSTRAINT "staking_event_height_block_height_fk" FOREIGN KEY ("height") REFERENCES "public"."block"("height") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "staking_event" ADD CONSTRAINT "staking_event_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "staking_event" ADD CONSTRAINT "staking_event_reward_account_address_stake_reward_account_address_fk" FOREIGN KEY ("reward_account_address") REFERENCES "public"."stake_reward_account"("address") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reward_claim" ADD CONSTRAINT "reward_claim_reward_account_address_stake_reward_account_address_fk" FOREIGN KEY ("reward_account_address") REFERENCES "public"."stake_reward_account"("address") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reward_claim" ADD CONSTRAINT "reward_claim_vault_address_stake_vault_address_fk" FOREIGN KEY ("vault_address") REFERENCES "public"."stake_vault"("address") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reward_claim" ADD CONSTRAINT "reward_claim_claimed_at_height_block_height_fk" FOREIGN KEY ("claimed_at_height") REFERENCES "public"."block"("height") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "staking_snapshot" ADD CONSTRAINT "staking_snapshot_vault_address_stake_vault_address_fk" FOREIGN KEY ("vault_address") REFERENCES "public"."stake_vault"("address") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "staking_snapshot" ADD CONSTRAINT "staking_snapshot_reward_account_address_stake_reward_account_address_fk" FOREIGN KEY ("reward_account_address") REFERENCES "public"."stake_reward_account"("address") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "staking_snapshot" ADD CONSTRAINT "staking_snapshot_height_block_height_fk" FOREIGN KEY ("height") REFERENCES "public"."block"("height") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "stake_vault_address_idx" ON "stake_vault" USING btree ("address");--> statement-breakpoint
CREATE INDEX "stake_vault_factory_idx" ON "stake_vault" USING btree ("factory_address");--> statement-breakpoint
CREATE INDEX "stake_vault_created_height_idx" ON "stake_vault" USING btree ("created_height");--> statement-breakpoint
CREATE INDEX "stake_reward_account_address_idx" ON "stake_reward_account" USING btree ("address");--> statement-breakpoint
CREATE INDEX "stake_reward_account_vault_idx" ON "stake_reward_account" USING btree ("vault_address");--> statement-breakpoint
CREATE UNIQUE INDEX "staked_nft_vault_collection_token_idx" ON "staked_nft" USING btree ("vault_address","collection_address","token_id");--> statement-breakpoint
CREATE INDEX "staked_nft_staker_idx" ON "staked_nft" USING btree ("staker_address","staked_at");--> statement-breakpoint
CREATE INDEX "staked_nft_vault_idx" ON "staked_nft" USING btree ("vault_address","staked_at");--> statement-breakpoint
CREATE INDEX "staked_nft_collection_token_idx" ON "staked_nft" USING btree ("collection_address","token_id");--> statement-breakpoint
CREATE INDEX "staked_nft_unstaked_idx" ON "staked_nft" USING btree ("unstaked_at_height");--> statement-breakpoint
CREATE INDEX "staking_event_user_idx" ON "staking_event" USING btree ("user_address","block_time");--> statement-breakpoint
CREATE INDEX "staking_event_vault_idx" ON "staking_event" USING btree ("vault_address","block_time");--> statement-breakpoint
CREATE INDEX "staking_event_height_idx" ON "staking_event" USING btree ("height");--> statement-breakpoint
CREATE INDEX "staking_event_tx_hash_idx" ON "staking_event" USING btree ("transaction_hash");--> statement-breakpoint
CREATE INDEX "staking_event_type_idx" ON "staking_event" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "reward_claim_user_idx" ON "reward_claim" USING btree ("user_address","claimed_at");--> statement-breakpoint
CREATE INDEX "reward_claim_account_idx" ON "reward_claim" USING btree ("reward_account_address","claimed_at");--> statement-breakpoint
CREATE INDEX "reward_claim_vault_idx" ON "reward_claim" USING btree ("vault_address");--> statement-breakpoint
CREATE INDEX "reward_claim_claimed_at_idx" ON "reward_claim" USING btree ("claimed_at");--> statement-breakpoint
CREATE INDEX "staking_snapshot_time_idx" ON "staking_snapshot" USING btree ("snapshot_time");--> statement-breakpoint
CREATE INDEX "staking_snapshot_vault_time_idx" ON "staking_snapshot" USING btree ("vault_address","snapshot_time");--> statement-breakpoint
CREATE INDEX "staking_snapshot_vault_user_time_idx" ON "staking_snapshot" USING btree ("vault_address","user_address","snapshot_time");--> statement-breakpoint
CREATE INDEX "staking_snapshot_height_idx" ON "staking_snapshot" USING btree ("height");--> statement-breakpoint
CREATE INDEX "staking_snapshot_type_idx" ON "staking_snapshot" USING btree ("snapshot_type");--> statement-breakpoint
CREATE INDEX "staking_snapshot_vault_type_time_idx" ON "staking_snapshot" USING btree ("vault_address","snapshot_type","snapshot_time");