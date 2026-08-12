import type { ProductAnalytics } from './product-analytics.js';

export class NoopProductAnalytics implements ProductAnalytics {
    track(): void {}
}
