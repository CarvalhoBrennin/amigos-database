-- Custom SQL migration file, put your code below! --
INSERT INTO platform_references (code, family, display_name, active, sort_order) VALUES
    ('PC_STEAM', 'PC', 'PC (Steam)', TRUE, 10),
    ('PC_MICROSOFT_STORE', 'PC', 'PC (Microsoft Store)', TRUE, 20),
    ('PC_EPIC', 'PC', 'PC (Epic Games Store)', TRUE, 30),
    ('XBOX_ONE', 'XBOX', 'Xbox One', TRUE, 40),
    ('XBOX_SERIES', 'XBOX', 'Xbox Series X|S', TRUE, 50),
    ('PS4', 'PLAYSTATION', 'PlayStation 4', TRUE, 60),
    ('PS5', 'PLAYSTATION', 'PlayStation 5', TRUE, 70),
    ('NINTENDO_SWITCH', 'NINTENDO', 'Nintendo Switch', TRUE, 80),
    ('ANDROID', 'MOBILE', 'Android', TRUE, 90),
    ('IOS', 'MOBILE', 'iPhone/iPad', TRUE, 100),
    ('BROWSER', 'BROWSER', 'Navegador', TRUE, 110)
ON CONFLICT (code) DO UPDATE SET
    family = EXCLUDED.family,
    display_name = EXCLUDED.display_name,
    active = EXCLUDED.active,
    sort_order = EXCLUDED.sort_order;

INSERT INTO subscription_services (id, code, display_name, publisher, active) VALUES
    ('10000000-0000-4000-8000-000000000001', 'XBOX_GAME_PASS', 'Xbox Game Pass', 'Microsoft', TRUE),
    ('10000000-0000-4000-8000-000000000002', 'PLAYSTATION_PLUS', 'PlayStation Plus (PS Plus)', 'Sony Interactive Entertainment', TRUE)
ON CONFLICT (code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    publisher = EXCLUDED.publisher,
    active = EXCLUDED.active;

INSERT INTO subscription_plans (id, service_id, code, display_name, active, sort_order) VALUES
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'XBOX_GAME_PASS_ULTIMATE', 'Xbox Game Pass Ultimate', TRUE, 10),
    ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'XBOX_GAME_PASS_PREMIUM', 'Xbox Game Pass Premium', TRUE, 20),
    ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'XBOX_GAME_PASS_ESSENTIAL', 'Xbox Game Pass Essential', TRUE, 30),
    ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'PC_GAME_PASS', 'PC Game Pass', TRUE, 40),
    ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'PLAYSTATION_PLUS_ESSENTIAL', 'PlayStation Plus Essential', TRUE, 50),
    ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'PLAYSTATION_PLUS_EXTRA', 'PlayStation Plus Extra', TRUE, 60),
    ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', 'PLAYSTATION_PLUS_DELUXE', 'PlayStation Plus Deluxe', TRUE, 70)
ON CONFLICT (code) DO UPDATE SET
    service_id = EXCLUDED.service_id,
    display_name = EXCLUDED.display_name,
    active = EXCLUDED.active,
    sort_order = EXCLUDED.sort_order;

INSERT INTO subscription_plan_regions (
    id,
    subscription_plan_id,
    region_code,
    active,
    capabilities,
    valid_from,
    valid_until,
    source_url,
    last_verified_at
) VALUES
    ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'BR', TRUE, '{"onlineMultiplayer":true,"gameCatalogDownload":true,"monthlyClaimedGames":false,"cloudStreaming":true}'::jsonb, '2026-08-11T00:00:00Z', NULL, 'https://www.xbox.com/pt-BR/xbox-game-pass/compare', '2026-08-11T00:00:00Z'),
    ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'BR', TRUE, '{"onlineMultiplayer":true,"gameCatalogDownload":true,"monthlyClaimedGames":false,"cloudStreaming":true}'::jsonb, '2026-08-11T00:00:00Z', NULL, 'https://www.xbox.com/pt-BR/xbox-game-pass/compare', '2026-08-11T00:00:00Z'),
    ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'BR', TRUE, '{"onlineMultiplayer":true,"gameCatalogDownload":true,"monthlyClaimedGames":false,"cloudStreaming":false}'::jsonb, '2026-08-11T00:00:00Z', NULL, 'https://www.xbox.com/pt-BR/xbox-game-pass/compare', '2026-08-11T00:00:00Z'),
    ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'BR', TRUE, '{"onlineMultiplayer":false,"gameCatalogDownload":true,"monthlyClaimedGames":false,"cloudStreaming":false}'::jsonb, '2026-08-11T00:00:00Z', NULL, 'https://www.xbox.com/pt-BR/xbox-game-pass/compare', '2026-08-11T00:00:00Z'),
    ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'BR', TRUE, '{"onlineMultiplayer":true,"gameCatalogDownload":false,"monthlyClaimedGames":true,"cloudStreaming":false}'::jsonb, '2026-08-11T00:00:00Z', NULL, 'https://www.playstation.com/pt-br/ps-plus/', '2026-08-11T00:00:00Z'),
    ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', 'BR', TRUE, '{"onlineMultiplayer":true,"gameCatalogDownload":true,"monthlyClaimedGames":true,"cloudStreaming":false}'::jsonb, '2026-08-11T00:00:00Z', NULL, 'https://www.playstation.com/pt-br/ps-plus/', '2026-08-11T00:00:00Z'),
    ('30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000007', 'BR', TRUE, '{"onlineMultiplayer":true,"gameCatalogDownload":true,"monthlyClaimedGames":true,"cloudStreaming":false}'::jsonb, '2026-08-11T00:00:00Z', NULL, 'https://www.playstation.com/pt-br/ps-plus/', '2026-08-11T00:00:00Z')
ON CONFLICT (id) DO UPDATE SET
    subscription_plan_id = EXCLUDED.subscription_plan_id,
    region_code = EXCLUDED.region_code,
    active = EXCLUDED.active,
    capabilities = EXCLUDED.capabilities,
    valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until,
    source_url = EXCLUDED.source_url,
    last_verified_at = EXCLUDED.last_verified_at;
