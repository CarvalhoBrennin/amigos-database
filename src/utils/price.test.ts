import { describe, expect, it } from 'vitest';
import {
    EXTERNAL_USD_TO_BRL_RATE,
    convertExternalUsdPrice,
    formatPricingToReal,
    formatToBRL,
    formatToUSD,
} from '@/utils/price';

describe('price utils', () => {
    it('converts external USD prices to BRL using the configured exchange rate', () => {
        const converted = convertExternalUsdPrice('9.99');

        expect(converted).toMatchObject({
            originalUsdValue: 9.99,
            convertedBrlValue: 9.99 * EXTERNAL_USD_TO_BRL_RATE,
            exchangeRate: EXTERNAL_USD_TO_BRL_RATE,
        });
        expect(converted?.formattedUsd).toBe(formatToUSD(9.99));
        expect(converted?.formattedBrl).toBe(formatToBRL(9.99 * EXTERNAL_USD_TO_BRL_RATE));
    });

    it('returns null for invalid external prices', () => {
        expect(convertExternalUsdPrice('not-a-price')).toBeNull();
    });

    it('formats browser pricing models and numeric values to BRL strings', () => {
        expect(formatPricingToReal('Free')).toBe('Grátis');
        expect(formatPricingToReal('Freemium')).toBe('Grátis com compras');
        expect(formatPricingToReal('10')).toBe(formatToBRL(10 * EXTERNAL_USD_TO_BRL_RATE));
    });
});
