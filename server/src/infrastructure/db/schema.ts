import {
    bigint,
    boolean,
    char,
    check,
    foreignKey,
    index,
    integer,
    jsonb,
    numeric,
    pgTable,
    primaryKey,
    smallint,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type {
    CandidateEvaluation,
    ParticipantPreferences,
    PrefilterSummary,
    RoomConstraints,
} from '../../../../shared/index.js';

const timestamps = {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
};

export const guestSessions = pgTable('guest_sessions', {
    id: uuid('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [index('guest_sessions_expires_at_idx').on(table.expiresAt)]);

export const rooms = pgTable('rooms', {
    id: uuid('id').primaryKey(),
    code: varchar('code', { length: 12 }).notNull().unique(),
    hostGuestSessionId: uuid('host_guest_session_id').notNull().references(() => guestSessions.id),
    status: varchar('status', { length: 16 }).notNull(),
    version: bigint('version', { mode: 'number' }).notNull().default(1),
    regionCode: char('region_code', { length: 2 }).notNull(),
    constraints: jsonb('constraints').$type<RoomConstraints>().notNull(),
    constraintsSchemaVersion: integer('constraints_schema_version').notNull(),
    inviteTokenHash: text('invite_token_hash').notNull(),
    prefilterSummary: jsonb('prefilter_summary').$type<PrefilterSummary | null>(),
    ...timestamps,
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
    index('rooms_expires_at_idx').on(table.expiresAt),
    index('rooms_status_expires_at_idx').on(table.status, table.expiresAt),
    index('rooms_host_guest_session_idx').on(table.hostGuestSessionId),
    check('rooms_status_check', sql`${table.status} IN ('LOBBY', 'MATCHING', 'SHORTLIST', 'COMPLETED', 'CANCELLED', 'EXPIRED')`),
    check('rooms_version_positive_check', sql`${table.version} > 0`),
    check('rooms_region_code_check', sql`${table.regionCode} ~ '^[A-Z]{2}$'`),
    check('rooms_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
]);

export const roomParticipants = pgTable('room_participants', {
    id: uuid('id').primaryKey(),
    roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
    guestSessionId: uuid('guest_session_id').notNull().references(() => guestSessions.id),
    nickname: varchar('nickname', { length: 40 }).notNull(),
    nicknameNormalized: varchar('nickname_normalized', { length: 80 }).notNull(),
    role: varchar('role', { length: 8 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    preferences: jsonb('preferences').$type<ParticipantPreferences>().notNull(),
    preferencesSchemaVersion: integer('preferences_schema_version').notNull(),
    pcTier: varchar('pc_tier', { length: 8 }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, (table) => [
    uniqueIndex('room_participants_room_session_uq').on(table.roomId, table.guestSessionId),
    uniqueIndex('room_participants_room_nickname_uq').on(table.roomId, table.nicknameNormalized),
    unique('room_participants_room_id_uq').on(table.roomId, table.id),
    index('room_participants_room_status_idx').on(table.roomId, table.status),
    index('room_participants_session_room_idx').on(table.guestSessionId, table.roomId),
    check('room_participants_role_check', sql`${table.role} IN ('HOST', 'MEMBER')`),
    check('room_participants_status_check', sql`${table.status} IN ('CONFIGURING', 'READY', 'LEFT')`),
    check('room_participants_pc_tier_check', sql`${table.pcTier} IS NULL OR ${table.pcTier} IN ('LOW', 'MID', 'HIGH')`),
]);

export const platformReferences = pgTable('platform_references', {
    code: varchar('code', { length: 40 }).primaryKey(),
    family: varchar('family', { length: 20 }).notNull(),
    displayName: varchar('display_name', { length: 80 }).notNull(),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
    check('platform_references_family_check', sql`${table.family} IN ('PC', 'XBOX', 'PLAYSTATION', 'NINTENDO', 'MOBILE', 'BROWSER')`),
]);

export const participantPlatforms = pgTable('participant_platforms', {
    participantId: uuid('participant_id').notNull().references(() => roomParticipants.id, { onDelete: 'cascade' }),
    platformCode: varchar('platform_code', { length: 40 }).notNull().references(() => platformReferences.code),
}, (table) => [primaryKey({ columns: [table.participantId, table.platformCode] })]);

export const subscriptionServices = pgTable('subscription_services', {
    id: uuid('id').primaryKey(),
    code: varchar('code', { length: 64 }).notNull().unique(),
    displayName: varchar('display_name', { length: 80 }).notNull(),
    publisher: varchar('publisher', { length: 80 }).notNull(),
    active: boolean('active').notNull().default(true),
});

export const subscriptionPlans = pgTable('subscription_plans', {
    id: uuid('id').primaryKey(),
    serviceId: uuid('service_id').notNull().references(() => subscriptionServices.id),
    code: varchar('code', { length: 80 }).notNull().unique(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
});

export const subscriptionPlanRegions = pgTable('subscription_plan_regions', {
    id: uuid('id').primaryKey(),
    subscriptionPlanId: uuid('subscription_plan_id').notNull().references(() => subscriptionPlans.id, { onDelete: 'cascade' }),
    regionCode: char('region_code', { length: 2 }).notNull(),
    active: boolean('active').notNull().default(true),
    capabilities: jsonb('capabilities').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    sourceUrl: text('source_url'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
}, (table) => [
    unique('subscription_plan_regions_identity_uq')
        .on(table.subscriptionPlanId, table.regionCode, table.validFrom)
        .nullsNotDistinct(),
    index('subscription_plan_regions_lookup_idx').on(
        table.subscriptionPlanId,
        table.regionCode,
        table.active
    ),
    check('subscription_plan_regions_dates_check', sql`${table.validFrom} IS NULL OR ${table.validUntil} IS NULL OR ${table.validFrom} <= ${table.validUntil}`),
    check('subscription_plan_regions_capabilities_check', sql`jsonb_typeof(${table.capabilities}) = 'object'`),
    check('subscription_plan_regions_region_code_check', sql`${table.regionCode} ~ '^[A-Z]{2}$'`),
    check('subscription_plan_regions_source_url_check', sql`${table.sourceUrl} IS NULL OR ${table.sourceUrl} ~* '^https://'`),
]);

export const participantSubscriptions = pgTable('participant_subscriptions', {
    participantId: uuid('participant_id').notNull().references(() => roomParticipants.id, { onDelete: 'cascade' }),
    subscriptionPlanId: uuid('subscription_plan_id').notNull().references(() => subscriptionPlans.id),
    selfReported: boolean('self_reported').notNull().default(true),
    declaredAt: timestamp('declared_at', { withTimezone: true }).notNull(),
}, (table) => [primaryKey({ columns: [table.participantId, table.subscriptionPlanId] })]);

export const participantOwnedGames = pgTable('participant_owned_games', {
    id: uuid('id').primaryKey(),
    participantId: uuid('participant_id').notNull().references(() => roomParticipants.id, { onDelete: 'cascade' }),
    gameId: varchar('game_id', { length: 64 }).notNull(),
    platformCode: varchar('platform_code', { length: 40 }).references(() => platformReferences.code),
    ownershipSource: varchar('ownership_source', { length: 24 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [
    index('participant_owned_games_participant_idx').on(table.participantId),
    unique('participant_owned_games_identity_uq')
        .on(table.participantId, table.gameId, table.platformCode)
        .nullsNotDistinct(),
    check('participant_owned_games_source_check', sql`${table.ownershipSource} IN ('SELF_REPORTED', 'STEAM_FUTURE')`),
]);

export const roomGameHistory = pgTable('room_game_history', {
    roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
    gameId: varchar('game_id', { length: 64 }).notNull(),
    disposition: varchar('disposition', { length: 16 }).notNull(),
    createdByParticipantId: uuid('created_by_participant_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [
    primaryKey({ columns: [table.roomId, table.gameId] }),
    foreignKey({
        columns: [table.roomId, table.createdByParticipantId],
        foreignColumns: [roomParticipants.roomId, roomParticipants.id],
        name: 'room_game_history_room_participant_fk',
    }).onDelete('cascade'),
    check('room_game_history_disposition_check', sql`${table.disposition} IN ('PLAYED', 'DO_NOT_SHOW', 'REPLAY_OK')`),
]);

export const gameDecisionProfiles = pgTable('game_decision_profiles', {
    gameId: varchar('game_id', { length: 64 }).primaryKey(),
    minOnlinePlayers: integer('min_online_players'),
    maxOnlinePlayers: integer('max_online_players'),
    minSessionMinutes: integer('min_session_minutes'),
    maxSessionMinutes: integer('max_session_minutes'),
    installSizeMb: integer('install_size_mb'),
    minPcTier: varchar('min_pc_tier', { length: 8 }),
    freeToPlay: boolean('free_to_play').notNull().default(false),
    communication: smallint('communication'),
    skill: smallint('skill'),
    chaos: smallint('chaos'),
    strategy: smallint('strategy'),
    story: smallint('story'),
    difficultyCode: varchar('difficulty_code', { length: 16 }),
    dataStatus: varchar('data_status', { length: 16 }).notNull(),
    sourceType: varchar('source_type', { length: 32 }),
    sourceUrl: text('source_url'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, (table) => [
    check('game_decision_profiles_player_count_check', sql`(${table.minOnlinePlayers} IS NULL OR ${table.minOnlinePlayers} > 0) AND (${table.maxOnlinePlayers} IS NULL OR ${table.maxOnlinePlayers} > 0) AND (${table.minOnlinePlayers} IS NULL OR ${table.maxOnlinePlayers} IS NULL OR ${table.minOnlinePlayers} <= ${table.maxOnlinePlayers})`),
    check('game_decision_profiles_session_check', sql`(${table.minSessionMinutes} IS NULL OR ${table.minSessionMinutes} > 0) AND (${table.maxSessionMinutes} IS NULL OR ${table.maxSessionMinutes} > 0) AND (${table.minSessionMinutes} IS NULL OR ${table.maxSessionMinutes} IS NULL OR ${table.minSessionMinutes} <= ${table.maxSessionMinutes})`),
    check('game_decision_profiles_data_status_check', sql`${table.dataStatus} IN ('COMPLETE', 'PARTIAL', 'UNKNOWN')`),
    check('game_decision_profiles_complete_provenance_check', sql`${table.dataStatus} <> 'COMPLETE' OR (${table.sourceUrl} IS NOT NULL AND ${table.lastVerifiedAt} IS NOT NULL)`),
    check('game_decision_profiles_source_type_check', sql`${table.sourceType} IS NULL OR ${table.sourceType} IN ('OFFICIAL_MANUAL', 'LICENSED_PROVIDER', 'ADMIN_IMPORT')`),
    check('game_decision_profiles_source_url_check', sql`${table.sourceUrl} IS NULL OR ${table.sourceUrl} ~* '^https://'`),
    check('game_decision_profiles_install_size_check', sql`${table.installSizeMb} IS NULL OR ${table.installSizeMb} >= 0`),
    check('game_decision_profiles_pc_tier_check', sql`${table.minPcTier} IS NULL OR ${table.minPcTier} IN ('LOW', 'MID', 'HIGH')`),
    check('game_decision_profiles_difficulty_check', sql`${table.difficultyCode} IS NULL OR ${table.difficultyCode} IN ('EASY', 'MODERATE', 'HARD', 'BRUTAL')`),
    check('game_decision_profiles_stats_check', sql`(${table.communication} IS NULL OR ${table.communication} BETWEEN 0 AND 10) AND (${table.skill} IS NULL OR ${table.skill} BETWEEN 0 AND 10) AND (${table.chaos} IS NULL OR ${table.chaos} BETWEEN 0 AND 10) AND (${table.strategy} IS NULL OR ${table.strategy} BETWEEN 0 AND 10) AND (${table.story} IS NULL OR ${table.story} BETWEEN 0 AND 10)`),
]);

export const gamePlatformOfferings = pgTable('game_platform_offerings', {
    id: uuid('id').primaryKey(),
    gameId: varchar('game_id', { length: 64 }).notNull(),
    platformCode: varchar('platform_code', { length: 40 }).notNull().references(() => platformReferences.code),
    regionCode: char('region_code', { length: 2 }),
    onlineSupported: boolean('online_supported').notNull(),
    freeToPlay: boolean('free_to_play').notNull().default(false),
    requiresPaidOnlineSubscription: boolean('requires_paid_online_subscription'),
    onlineRequirementVerificationStatus: varchar('online_requirement_verification_status', { length: 16 }).notNull(),
    sourceType: varchar('source_type', { length: 32 }).notNull(),
    sourceUrl: text('source_url'),
    verificationStatus: varchar('verification_status', { length: 16 }).notNull(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
}, (table) => [
    unique('game_platform_offerings_identity_uq')
        .on(table.gameId, table.platformCode, table.regionCode, table.validFrom)
        .nullsNotDistinct(),
    index('game_platform_offerings_lookup_idx').on(table.gameId, table.regionCode),
    check('game_platform_offerings_verification_check', sql`${table.verificationStatus} IN ('VERIFIED', 'STALE', 'UNKNOWN')`),
    check('game_platform_offerings_online_verification_check', sql`${table.onlineRequirementVerificationStatus} IN ('VERIFIED', 'STALE', 'UNKNOWN')`),
    check('game_platform_offerings_verified_source_check', sql`(${table.verificationStatus} <> 'VERIFIED' AND ${table.onlineRequirementVerificationStatus} <> 'VERIFIED') OR (${table.sourceUrl} IS NOT NULL AND ${table.lastVerifiedAt} IS NOT NULL)`),
    check('game_platform_offerings_source_type_check', sql`${table.sourceType} IN ('OFFICIAL_MANUAL', 'LICENSED_PROVIDER', 'ADMIN_IMPORT')`),
    check('game_platform_offerings_source_url_check', sql`${table.sourceUrl} IS NULL OR ${table.sourceUrl} ~* '^https://'`),
    check('game_platform_offerings_region_code_check', sql`${table.regionCode} IS NULL OR ${table.regionCode} ~ '^[A-Z]{2}$'`),
    check('game_platform_offerings_dates_check', sql`${table.validFrom} IS NULL OR ${table.validUntil} IS NULL OR ${table.validFrom} <= ${table.validUntil}`),
]);

export const gameNetworkPools = pgTable('game_network_pools', {
    id: uuid('id').primaryKey(),
    gameId: varchar('game_id', { length: 64 }).notNull(),
    poolCode: varchar('pool_code', { length: 80 }).notNull(),
    regionCode: char('region_code', { length: 2 }),
    sourceType: varchar('source_type', { length: 32 }).notNull(),
    sourceUrl: text('source_url'),
    verificationStatus: varchar('verification_status', { length: 16 }).notNull(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
}, (table) => [
    unique('game_network_pools_identity_uq')
        .on(table.gameId, table.poolCode, table.regionCode, table.validFrom)
        .nullsNotDistinct(),
    index('game_network_pools_lookup_idx').on(table.gameId, table.regionCode),
    check('game_network_pools_verification_check', sql`${table.verificationStatus} IN ('VERIFIED', 'STALE', 'UNKNOWN')`),
    check('game_network_pools_verified_source_check', sql`${table.verificationStatus} <> 'VERIFIED' OR (${table.sourceUrl} IS NOT NULL AND ${table.lastVerifiedAt} IS NOT NULL)`),
    check('game_network_pools_source_type_check', sql`${table.sourceType} IN ('OFFICIAL_MANUAL', 'LICENSED_PROVIDER', 'ADMIN_IMPORT')`),
    check('game_network_pools_source_url_check', sql`${table.sourceUrl} IS NULL OR ${table.sourceUrl} ~* '^https://'`),
    check('game_network_pools_region_code_check', sql`${table.regionCode} IS NULL OR ${table.regionCode} ~ '^[A-Z]{2}$'`),
    check('game_network_pools_pool_code_check', sql`${table.poolCode} ~ '^[A-Z0-9_:-]+$'`),
    check('game_network_pools_dates_check', sql`${table.validFrom} IS NULL OR ${table.validUntil} IS NULL OR ${table.validFrom} <= ${table.validUntil}`),
]);

export const gameNetworkPoolPlatforms = pgTable('game_network_pool_platforms', {
    networkPoolId: uuid('network_pool_id').notNull().references(() => gameNetworkPools.id, { onDelete: 'cascade' }),
    platformCode: varchar('platform_code', { length: 40 }).notNull().references(() => platformReferences.code),
}, (table) => [primaryKey({ columns: [table.networkPoolId, table.platformCode] })]);

export const gameSubscriptionAvailability = pgTable('game_subscription_availability', {
    id: uuid('id').primaryKey(),
    gameId: varchar('game_id', { length: 64 }).notNull(),
    subscriptionPlanId: uuid('subscription_plan_id').notNull().references(() => subscriptionPlans.id),
    platformCode: varchar('platform_code', { length: 40 }).notNull().references(() => platformReferences.code),
    regionCode: char('region_code', { length: 2 }).notNull(),
    accessType: varchar('access_type', { length: 24 }).notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    verificationStatus: varchar('verification_status', { length: 16 }).notNull(),
    sourceType: varchar('source_type', { length: 32 }).notNull(),
    sourceUrl: text('source_url'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
}, (table) => [
    unique('game_subscription_availability_identity_uq')
        .on(
            table.gameId,
            table.subscriptionPlanId,
            table.platformCode,
            table.regionCode,
            table.accessType,
            table.validFrom
        )
        .nullsNotDistinct(),
    index('game_subscription_availability_game_region_idx').on(table.gameId, table.regionCode),
    index('game_subscription_availability_plan_region_idx').on(table.subscriptionPlanId, table.regionCode),
    index('game_subscription_availability_valid_until_idx').on(table.validUntil),
    check('game_subscription_availability_access_type_check', sql`${table.accessType} IN ('DOWNLOAD', 'CLOUD_STREAM')`),
    check('game_subscription_availability_verification_check', sql`${table.verificationStatus} IN ('VERIFIED', 'STALE', 'UNKNOWN')`),
    check('game_subscription_availability_source_type_check', sql`${table.sourceType} IN ('OFFICIAL_MANUAL', 'LICENSED_PROVIDER', 'ADMIN_IMPORT')`),
    check('game_subscription_availability_source_url_check', sql`${table.sourceUrl} IS NULL OR ${table.sourceUrl} ~* '^https://'`),
    check('game_subscription_availability_region_code_check', sql`${table.regionCode} ~ '^[A-Z]{2}$'`),
    check('game_subscription_availability_dates_check', sql`${table.validFrom} IS NULL OR ${table.validUntil} IS NULL OR ${table.validFrom} <= ${table.validUntil}`),
    check('game_subscription_availability_verified_source_check', sql`${table.verificationStatus} <> 'VERIFIED' OR (${table.sourceUrl} IS NOT NULL AND ${table.lastVerifiedAt} IS NOT NULL)`),
]);

export const gamePrices = pgTable('game_prices', {
    id: uuid('id').primaryKey(),
    gameId: varchar('game_id', { length: 64 }).notNull(),
    platformCode: varchar('platform_code', { length: 40 }).notNull().references(() => platformReferences.code),
    regionCode: char('region_code', { length: 2 }).notNull(),
    storeCode: varchar('store_code', { length: 64 }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    regularAmountMinor: bigint('regular_amount_minor', { mode: 'number' }),
    quality: varchar('quality', { length: 24 }).notNull(),
    sourceUrl: text('source_url').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
}, (table) => [
    unique('game_prices_observation_uq').on(
        table.gameId,
        table.platformCode,
        table.regionCode,
        table.storeCode,
        table.observedAt
    ),
    index('game_prices_latest_idx').on(table.gameId, table.platformCode, table.regionCode, table.observedAt),
    index('game_prices_game_region_observed_idx').on(table.gameId, table.regionCode, table.observedAt.desc()),
    check('game_prices_amount_check', sql`${table.amountMinor} >= 0 AND (${table.regularAmountMinor} IS NULL OR ${table.regularAmountMinor} >= 0)`),
    check('game_prices_quality_check', sql`${table.quality} IN ('VERIFIED_LOCAL', 'PROVIDER_ESTIMATE', 'LEGACY_STATIC')`),
    check('game_prices_currency_check', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check('game_prices_source_url_check', sql`${table.sourceUrl} ~* '^https://'`),
    check('game_prices_region_code_check', sql`${table.regionCode} ~ '^[A-Z]{2}$'`),
]);

export const roomRoundParticipants = pgTable('room_round_participants', {
    roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id').notNull(),
}, (table) => [
    primaryKey({ columns: [table.roomId, table.participantId] }),
    foreignKey({
        columns: [table.roomId, table.participantId],
        foreignColumns: [roomParticipants.roomId, roomParticipants.id],
        name: 'room_round_participants_room_participant_fk',
    }).onDelete('cascade'),
]);

export const roomCandidates = pgTable('room_candidates', {
    roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
    gameId: varchar('game_id', { length: 64 }).notNull(),
    baseScore: numeric('base_score', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    rankSeed: bigint('rank_seed', { mode: 'number' }).notNull(),
    evaluation: jsonb('evaluation').$type<CandidateEvaluation>().notNull(),
    dataSnapshotVersion: integer('data_snapshot_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [
    primaryKey({ columns: [table.roomId, table.gameId] }),
    check('room_candidates_score_check', sql`${table.baseScore} BETWEEN 0 AND 100`),
]);

export const roomVotes = pgTable('room_votes', {
    roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
    gameId: varchar('game_id', { length: 64 }).notNull(),
    participantId: uuid('participant_id').notNull(),
    value: varchar('value', { length: 8 }).notNull(),
    ...timestamps,
}, (table) => [
    primaryKey({ columns: [table.roomId, table.gameId, table.participantId] }),
    foreignKey({
        columns: [table.roomId, table.participantId],
        foreignColumns: [roomParticipants.roomId, roomParticipants.id],
        name: 'room_votes_room_participant_fk',
    }).onDelete('cascade'),
    index('room_votes_room_game_idx').on(table.roomId, table.gameId),
    index('room_votes_room_participant_game_idx').on(table.roomId, table.participantId, table.gameId),
    check('room_votes_value_check', sql`${table.value} IN ('NO', 'MAYBE', 'YES')`),
]);

export const roomMatches = pgTable('room_matches', {
    roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
    gameId: varchar('game_id', { length: 64 }).notNull(),
    kind: varchar('kind', { length: 8 }).notNull(),
    matchScore: numeric('match_score', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    voteSummary: jsonb('vote_summary').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [
    primaryKey({ columns: [table.roomId, table.gameId] }),
    check('room_matches_kind_check', sql`${table.kind} IN ('PERFECT', 'STRONG')`),
    check('room_matches_score_check', sql`${table.matchScore} BETWEEN 0 AND 100`),
]);

export const roomDecisions = pgTable('room_decisions', {
    roomId: uuid('room_id').primaryKey().references(() => rooms.id, { onDelete: 'cascade' }),
    gameId: varchar('game_id', { length: 64 }).notNull(),
    selectedByParticipantId: uuid('selected_by_participant_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [
    foreignKey({
        columns: [table.roomId, table.selectedByParticipantId],
        foreignColumns: [roomParticipants.roomId, roomParticipants.id],
        name: 'room_decisions_room_participant_fk',
    }).onDelete('cascade'),
]);

export const idempotencyKeys = pgTable('idempotency_keys', {
    id: uuid('id').primaryKey(),
    guestSessionId: uuid('guest_session_id').notNull().references(() => guestSessions.id, { onDelete: 'cascade' }),
    operation: varchar('operation', { length: 80 }).notNull(),
    keyHash: text('key_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
    uniqueIndex('idempotency_keys_session_operation_key_uq').on(
        table.guestSessionId,
        table.operation,
        table.keyHash
    ),
    index('idempotency_keys_expires_at_idx').on(table.expiresAt),
]);

export const adminUsers = pgTable('admin_users', {
    id: uuid('id').primaryKey(),
    email: varchar('email', { length: 254 }).notNull().unique(),
    displayName: varchar('display_name', { length: 80 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: varchar('role', { length: 16 }).notNull(),
    active: boolean('active').notNull().default(true),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }).notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
}, (table) => [
    index('admin_users_active_role_idx').on(table.active, table.role),
    check('admin_users_email_normalized_check', sql`${table.email} = lower(${table.email})`),
    check('admin_users_role_check', sql`${table.role} IN ('SUPER_ADMIN', 'EDITOR', 'VIEWER')`),
    check('admin_users_failed_login_attempts_check', sql`${table.failedLoginAttempts} >= 0`),
]);

export const adminSessions = pgTable('admin_sessions', {
    id: uuid('id').primaryKey(),
    adminUserId: uuid('admin_user_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ipHash: text('ip_hash'),
    userAgentHash: text('user_agent_hash'),
}, (table) => [
    index('admin_sessions_expires_at_idx').on(table.expiresAt),
    check('admin_sessions_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
]);

export const adminAuditLog = pgTable('admin_audit_log', {
    id: uuid('id').primaryKey(),
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 80 }).notNull(),
    entityType: varchar('entity_type', { length: 80 }).notNull(),
    entityId: varchar('entity_id', { length: 128 }),
    requestId: varchar('request_id', { length: 128 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [
    index('admin_audit_log_created_at_idx').on(table.createdAt.desc()),
    index('admin_audit_log_actor_created_idx').on(table.adminUserId, table.createdAt.desc()),
    index('admin_audit_log_entity_created_idx').on(table.entityType, table.entityId, table.createdAt.desc()),
    check('admin_audit_log_metadata_check', sql`jsonb_typeof(${table.metadata}) = 'object'`),
]);
