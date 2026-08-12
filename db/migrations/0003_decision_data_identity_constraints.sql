-- Custom SQL migration file, put your code below! --
CREATE UNIQUE INDEX subscription_plan_regions_identity_uq
    ON subscription_plan_regions (subscription_plan_id, region_code, valid_from) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX game_platform_offerings_identity_uq
    ON game_platform_offerings (game_id, platform_code, region_code, valid_from) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX game_network_pools_identity_uq
    ON game_network_pools (game_id, pool_code, region_code, valid_from) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX game_subscription_availability_identity_uq
    ON game_subscription_availability (
        game_id,
        subscription_plan_id,
        platform_code,
        region_code,
        access_type,
        valid_from
    ) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX game_prices_observation_uq
    ON game_prices (game_id, platform_code, region_code, store_code, observed_at);
