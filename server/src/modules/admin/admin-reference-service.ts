import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { z } from 'zod';
import type {
    adminPlanRegionMutationSchema,
    adminPlatformMutationSchema,
    adminSubscriptionPlanMutationSchema,
    adminSubscriptionServiceMutationSchema,
} from '../../../../shared/index.js';
import { AppError } from '../../lib/errors.js';
import type { AdminAuditService } from './admin-audit-service.js';

type PlatformInput = z.infer<typeof adminPlatformMutationSchema>;
type ServiceInput = z.infer<typeof adminSubscriptionServiceMutationSchema>;
type PlanInput = z.infer<typeof adminSubscriptionPlanMutationSchema>;
type PlanRegionInput = z.infer<typeof adminPlanRegionMutationSchema>;

interface AuditContext {
    actorId: string;
    requestId: string;
}

export class AdminReferenceService {
    constructor(
        private readonly pool: Pool,
        private readonly audit: AdminAuditService
    ) {}

    async listAll() {
        const [platforms, services, plans, regions] = await Promise.all([
            this.pool.query<{
                code: string;
                family: string;
                display_name: string;
                active: boolean;
                sort_order: number;
            }>('SELECT code, family, display_name, active, sort_order FROM platform_references ORDER BY sort_order, display_name'),
            this.pool.query<{
                id: string;
                code: string;
                display_name: string;
                publisher: string;
                active: boolean;
            }>('SELECT id, code, display_name, publisher, active FROM subscription_services ORDER BY display_name'),
            this.pool.query<{
                id: string;
                service_id: string;
                service_code: string;
                code: string;
                display_name: string;
                active: boolean;
                sort_order: number;
            }>(
                `SELECT plan.id, plan.service_id, service.code AS service_code, plan.code,
                        plan.display_name, plan.active, plan.sort_order
                   FROM subscription_plans plan
                   JOIN subscription_services service ON service.id = plan.service_id
                  ORDER BY service.display_name, plan.sort_order, plan.display_name`
            ),
            this.pool.query<{
                id: string;
                plan_id: string;
                plan_code: string;
                region_code: string;
                active: boolean;
                capabilities: Record<string, unknown>;
                valid_from: Date | null;
                valid_until: Date | null;
                source_url: string | null;
                last_verified_at: Date | null;
            }>(
                `SELECT region.id, region.subscription_plan_id AS plan_id, plan.code AS plan_code,
                        region.region_code, region.active, region.capabilities, region.valid_from,
                        region.valid_until, region.source_url, region.last_verified_at
                   FROM subscription_plan_regions region
                   JOIN subscription_plans plan ON plan.id = region.subscription_plan_id
                  ORDER BY plan.code, region.region_code, region.valid_from DESC NULLS LAST`
            ),
        ]);
        return {
            platforms: platforms.rows.map((row) => ({
                code: row.code,
                family: row.family,
                displayName: row.display_name,
                active: row.active,
                sortOrder: row.sort_order,
            })),
            services: services.rows.map((row) => ({
                id: row.id,
                code: row.code,
                displayName: row.display_name,
                publisher: row.publisher,
                active: row.active,
            })),
            plans: plans.rows.map((row) => ({
                id: row.id,
                serviceId: row.service_id,
                serviceCode: row.service_code,
                code: row.code,
                displayName: row.display_name,
                active: row.active,
                sortOrder: row.sort_order,
            })),
            planRegions: regions.rows.map((row) => ({
                id: row.id,
                planId: row.plan_id,
                planCode: row.plan_code,
                regionCode: row.region_code,
                active: row.active,
                capabilities: row.capabilities,
                validFrom: row.valid_from?.toISOString() ?? null,
                validUntil: row.valid_until?.toISOString() ?? null,
                sourceUrl: row.source_url,
                lastVerifiedAt: row.last_verified_at?.toISOString() ?? null,
            })),
        };
    }

    async savePlatform(data: PlatformInput, context: AuditContext, existingCode?: string) {
        await this.mutate(
            context,
            existingCode ? 'REFERENCE_PLATFORM_UPDATED' : 'REFERENCE_PLATFORM_CREATED',
            'PLATFORM',
            existingCode ?? data.code,
            async (client) => {
                const result = existingCode
                    ? await client.query(
                        `UPDATE platform_references SET family=$2, display_name=$3, active=$4, sort_order=$5
                          WHERE code=$1 RETURNING code`,
                        [existingCode, data.family, data.displayName, data.active, data.sortOrder]
                    )
                    : await client.query(
                        `INSERT INTO platform_references (code, family, display_name, active, sort_order)
                         VALUES ($1,$2,$3,$4,$5) RETURNING code`,
                        [data.code, data.family, data.displayName, data.active, data.sortOrder]
                    );
                return result.rowCount;
            }
        );
        return this.listAll();
    }

    async saveService(data: ServiceInput, context: AuditContext, id?: string) {
        const resourceId = id ?? randomUUID();
        await this.mutate(context, id ? 'REFERENCE_SERVICE_UPDATED' : 'REFERENCE_SERVICE_CREATED', 'SUBSCRIPTION_SERVICE', resourceId, async (client) => {
            const result = id
                ? await client.query(
                    `UPDATE subscription_services SET code=$2, display_name=$3, publisher=$4, active=$5
                      WHERE id=$1 RETURNING id`,
                    [id, data.code, data.displayName, data.publisher, data.active]
                )
                : await client.query(
                    `INSERT INTO subscription_services (id, code, display_name, publisher, active)
                     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
                    [resourceId, data.code, data.displayName, data.publisher, data.active]
                );
            return result.rowCount;
        });
        return this.listAll();
    }

    async savePlan(data: PlanInput, context: AuditContext, id?: string) {
        const resourceId = id ?? randomUUID();
        await this.mutate(context, id ? 'REFERENCE_PLAN_UPDATED' : 'REFERENCE_PLAN_CREATED', 'SUBSCRIPTION_PLAN', resourceId, async (client) => {
            const result = id
                ? await client.query(
                    `UPDATE subscription_plans SET service_id=$2, code=$3, display_name=$4,
                            active=$5, sort_order=$6 WHERE id=$1 RETURNING id`,
                    [id, data.serviceId, data.code, data.displayName, data.active, data.sortOrder]
                )
                : await client.query(
                    `INSERT INTO subscription_plans (id, service_id, code, display_name, active, sort_order)
                     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
                    [resourceId, data.serviceId, data.code, data.displayName, data.active, data.sortOrder]
                );
            return result.rowCount;
        });
        return this.listAll();
    }

    async savePlanRegion(data: PlanRegionInput, context: AuditContext, id?: string) {
        const resourceId = id ?? randomUUID();
        await this.mutate(context, id ? 'REFERENCE_PLAN_REGION_UPDATED' : 'REFERENCE_PLAN_REGION_CREATED', 'SUBSCRIPTION_PLAN_REGION', resourceId, async (client) => {
            const values = [
                resourceId,
                data.planId,
                data.regionCode,
                data.active,
                JSON.stringify(data.capabilities),
                toDate(data.validFrom),
                toDate(data.validUntil),
                data.sourceUrl,
                toDate(data.lastVerifiedAt),
            ];
            const result = id
                ? await client.query(
                    `UPDATE subscription_plan_regions SET subscription_plan_id=$2, region_code=$3,
                            active=$4, capabilities=$5, valid_from=$6, valid_until=$7,
                            source_url=$8, last_verified_at=$9 WHERE id=$1 RETURNING id`,
                    values
                )
                : await client.query(
                    `INSERT INTO subscription_plan_regions (
                        id, subscription_plan_id, region_code, active, capabilities,
                        valid_from, valid_until, source_url, last_verified_at
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
                    values
                );
            return result.rowCount;
        });
        return this.listAll();
    }

    async delete(resource: 'platforms' | 'services' | 'plans' | 'plan-regions', id: string, context: AuditContext) {
        const table = {
            platforms: 'platform_references',
            services: 'subscription_services',
            plans: 'subscription_plans',
            'plan-regions': 'subscription_plan_regions',
        }[resource];
        const column = resource === 'platforms' ? 'code' : 'id';
        try {
            await withTransaction(this.pool, async (client) => {
                const result = await client.query(`DELETE FROM ${table} WHERE ${column} = $1 RETURNING ${column}`, [id]);
                this.assertSaved(result.rowCount);
                await this.record(context, 'REFERENCE_DELETED', resource.toUpperCase(), id, client);
            });
        } catch (error) {
            if (isForeignKeyViolation(error)) {
                throw new AppError({
                    status: 409,
                    code: 'ADMIN_REFERENCE_IN_USE',
                    title: 'Esta referência está em uso e não pode ser excluída; desative-a',
                });
            }
            throw error;
        }
        return this.listAll();
    }

    private async mutate(
        context: AuditContext,
        action: string,
        entityType: string,
        entityId: string,
        work: (client: PoolClient) => Promise<number | null>
    ): Promise<void> {
        try {
            await withTransaction(this.pool, async (client) => {
                this.assertSaved(await work(client));
                await this.record(context, action, entityType, entityId, client);
            });
        } catch (error) {
            if (isUniqueViolation(error)) {
                throw new AppError({
                    status: 409,
                    code: 'ADMIN_REFERENCE_CONFLICT',
                    title: 'Já existe uma referência com este código ou identidade',
                });
            }
            if (isForeignKeyViolation(error)) {
                throw new AppError({
                    status: 409,
                    code: 'ADMIN_REFERENCE_PARENT_INVALID',
                    title: 'O serviço, plano ou plataforma relacionado não existe mais',
                });
            }
            throw error;
        }
    }

    private assertSaved(rowCount: number | null): void {
        if (rowCount === 0) throw new AppError({ status: 404, code: 'ADMIN_REFERENCE_NOT_FOUND', title: 'Referência não encontrada' });
    }

    private async record(context: AuditContext, action: string, entityType: string, entityId: string, client?: PoolClient): Promise<void> {
        await this.audit.record({
            adminUserId: context.actorId,
            action,
            entityType,
            entityId,
            requestId: context.requestId,
        }, client);
    }
}

function toDate(value: string | null): Date | null {
    return value ? new Date(value) : null;
}

function isForeignKeyViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23503';
}

function isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
