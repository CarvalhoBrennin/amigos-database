import type { ApiFieldError, ApiProblem } from '../../../shared/contracts/api-errors.js';

export class AppError extends Error {
    readonly status: number;
    readonly code: string;
    readonly title: string;
    readonly detail?: string;
    readonly fieldErrors?: ApiFieldError[];
    readonly currentVersion?: number;

    constructor(options: {
        status: number;
        code: string;
        title: string;
        detail?: string;
        fieldErrors?: ApiFieldError[];
        currentVersion?: number;
    }) {
        super(options.detail ?? options.title);
        this.name = 'AppError';
        this.status = options.status;
        this.code = options.code;
        this.title = options.title;
        this.detail = options.detail;
        this.fieldErrors = options.fieldErrors;
        this.currentVersion = options.currentVersion;
    }
}

export function toProblemDetails(error: AppError, requestId: string): ApiProblem {
    return {
        type: `https://amigos-database.dev/problems/${error.code.toLowerCase()}`,
        title: error.title,
        status: error.status,
        code: error.code,
        requestId,
        ...(error.detail ? { detail: error.detail } : {}),
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        ...(error.currentVersion ? { currentVersion: error.currentVersion } : {}),
    };
}
