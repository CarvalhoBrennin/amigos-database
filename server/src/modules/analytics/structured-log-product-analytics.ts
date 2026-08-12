import type { ProductAnalytics, ProductEvent } from './product-analytics.js';

export class StructuredLogProductAnalytics implements ProductAnalytics {
    constructor(private readonly log: (event: ProductEvent) => void) {}

    track(event: ProductEvent): void {
        this.log(event);
    }
}
