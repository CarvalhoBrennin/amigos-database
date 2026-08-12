export interface MetricEvent {
    name: string;
    value: number;
    labels?: Record<string, string | number | boolean>;
}

export interface Metrics {
    record(event: MetricEvent): void;
}

export class NoopMetrics implements Metrics {
    record(): void {}
}

export class StructuredLogMetrics implements Metrics {
    constructor(private readonly log: (event: MetricEvent) => void) {}

    record(event: MetricEvent): void {
        this.log(event);
    }
}

export const noopMetrics = new NoopMetrics();
