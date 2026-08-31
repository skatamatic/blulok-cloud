import type { ObjectSchema } from 'joi';
import type { HttpMethod } from './types';

export type RouteResponseSchemas = Record<number, ObjectSchema | undefined>;

export type RegisteredRoute = {
  method: HttpMethod;
  openApiPath: string;
  tags: string[];
  summary?: string;
  description?: string;
  security?: 'bearer' | 'none';
  params?: ObjectSchema;
  query?: ObjectSchema;
  body?: ObjectSchema;
  responses?: RouteResponseSchemas;
  migrationStatus: 'complete' | 'pending';
};

class OpenApiRegistry {
  private routes: RegisteredRoute[] = [];

  register(route: RegisteredRoute): void {
    this.routes.push(route);
  }

  getRoutes(): RegisteredRoute[] {
    return [...this.routes];
  }

  clear(): void {
    this.routes = [];
  }

  countByStatus(status: 'complete' | 'pending'): number {
    return this.routes.filter((r) => r.migrationStatus === status).length;
  }
}

export const openApiRegistry = new OpenApiRegistry();
