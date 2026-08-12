DELETE FROM game_prices WHERE game_id = '1';
DELETE FROM game_subscription_availability WHERE game_id = '1';
DELETE FROM game_network_pools WHERE game_id = '1';
DELETE FROM game_platform_offerings WHERE game_id = '1';
DELETE FROM game_decision_profiles WHERE game_id = '1';

INSERT INTO game_decision_profiles (
    game_id, min_online_players, max_online_players, min_session_minutes,
    max_session_minutes, install_size_mb, min_pc_tier, free_to_play,
    communication, skill, chaos, strategy, story, difficulty_code,
    data_status, source_type, source_url, last_verified_at, updated_at
) VALUES (
    '1', 1, 4, 30, 60, 1000, NULL, FALSE,
    5, 5, 5, 5, 5, 'MODERATE', 'COMPLETE', 'ADMIN_IMPORT',
    'https://fixtures.test.invalid/profile', NOW(), NOW()
);

INSERT INTO game_platform_offerings (
    id, game_id, platform_code, region_code, online_supported, free_to_play,
    requires_paid_online_subscription, online_requirement_verification_status,
    source_type, source_url, verification_status, last_verified_at, valid_from, valid_until
) VALUES (
    '41000000-0000-4000-8000-000000000001', '1', 'PC_STEAM', 'BR', TRUE, FALSE,
    FALSE, 'VERIFIED', 'ADMIN_IMPORT', 'https://fixtures.test.invalid/offering',
    'VERIFIED', NOW(), NOW() - INTERVAL '1 day', NULL
);

INSERT INTO game_network_pools (
    id, game_id, pool_code, region_code, source_type, source_url,
    verification_status, last_verified_at, valid_from, valid_until
) VALUES (
    '51000000-0000-4000-8000-000000000001', '1', 'E2E_POOL', 'BR',
    'ADMIN_IMPORT', 'https://fixtures.test.invalid/pool', 'VERIFIED', NOW(),
    NOW() - INTERVAL '1 day', NULL
);
INSERT INTO game_network_pool_platforms (network_pool_id, platform_code)
VALUES ('51000000-0000-4000-8000-000000000001', 'PC_STEAM');

INSERT INTO game_prices (
    id, game_id, platform_code, region_code, store_code, amount_minor,
    currency, regular_amount_minor, quality, source_url, observed_at, valid_until
) VALUES (
    '61000000-0000-4000-8000-000000000001', '1', 'PC_STEAM', 'BR',
    'E2E_STORE', 1000, 'BRL', 2000, 'VERIFIED_LOCAL',
    'https://fixtures.test.invalid/price', NOW(), NOW() + INTERVAL '1 day'
);
