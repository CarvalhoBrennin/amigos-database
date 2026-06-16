const DEFAULT_EXTERNAL_USD_TO_BRL_RATE = 5.5;

function resolveExchangeRate(): number {
    const configuredRate = Number.parseFloat(import.meta.env.VITE_EXTERNAL_USD_TO_BRL ?? '');
    return Number.isFinite(configuredRate) && configuredRate > 0
        ? configuredRate
        : DEFAULT_EXTERNAL_USD_TO_BRL_RATE;
}

function parsePriceValue(value: string): number | null {
    const normalizedValue = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(normalizedValue) ? normalizedValue : null;
}

export const EXTERNAL_USD_TO_BRL_RATE = resolveExchangeRate();

const brlFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
});

const usdFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

export function formatPricingToReal(pricing: string, paidFallback = 'R$ 29,90'): string {
    if (pricing.startsWith('R$')) {
        return pricing;
    }

    switch (pricing) {
        case 'Free':
            return 'Grátis';
        case 'Freemium':
            return 'Grátis com compras';
        case 'Paid':
            return paidFallback;
        default: {
            const numValue = parsePriceValue(pricing);
            if (numValue !== null) {
                return formatToBRL(numValue * EXTERNAL_USD_TO_BRL_RATE);
            }

            return pricing;
        }
    }
}

export function formatToBRL(value: number): string {
    return brlFormatter.format(value);
}

export function formatToUSD(value: number): string {
    return usdFormatter.format(value);
}

export interface ConvertedExternalPrice {
    originalUsdValue: number;
    convertedBrlValue: number;
    formattedUsd: string;
    formattedBrl: string;
    exchangeRate: number;
}

export function convertExternalUsdPrice(
    usdPrice: string,
    exchangeRate = EXTERNAL_USD_TO_BRL_RATE
): ConvertedExternalPrice | null {
    const originalUsdValue = parsePriceValue(usdPrice);

    if (originalUsdValue === null) {
        return null;
    }

    const convertedBrlValue = originalUsdValue * exchangeRate;

    return {
        originalUsdValue,
        convertedBrlValue,
        formattedUsd: formatToUSD(originalUsdValue),
        formattedBrl: formatToBRL(convertedBrlValue),
        exchangeRate,
    };
}

export function isFreePrice(price: string): boolean {
    const normalized = price.trim().toLowerCase();
    return normalized === 'grátis' || normalized === 'free' || normalized.startsWith('grátis');
}
