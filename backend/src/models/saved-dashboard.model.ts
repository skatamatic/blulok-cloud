import { BaseModel } from './base.model';
import { UserRole } from '@/types/auth.types';
import { UserModel, User } from './user.model';
import {
  DashboardPagePayload,
  UserWidgetLayoutModel,
} from './user-widget-layout.model';
import {
  clampAndValidatePages,
  DashboardSnapshot,
  workingLayoutToPayload,
} from '@/utils/dashboard-layout-payload.utils';
import { FacilityModel } from '@/models/facility.model';
import { ActiveFacilityContext, computeScopeEntityId } from '@/utils/dashboard-assignment.utils';

export interface SavedDashboard {
  id: string;
  name: string;
  description: string | null;
  snapshot: DashboardSnapshot | string;
  page_count: number;
  widget_count: number;
  created_by: string;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface SavedDashboardListItem {
  id: string;
  name: string;
  description: string | null;
  pageCount: number;
  widgetCount: number;
  createdBy: string;
  createdByEmail?: string;
  updatedAt: Date;
}

export type DashboardAssignmentScope = 'global' | 'facility' | 'user';

export interface DashboardAssignmentListItem {
  id: string;
  savedDashboardId: string;
  savedDashboardName: string;
  scope: DashboardAssignmentScope;
  facilityId: string | null;
  facilityName: string | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  targetRole: string;
  priority: number;
  createdBy: string;
  updatedAt: Date;
}

export interface CreateAssignmentPayload {
  savedDashboardId: string;
  scope: DashboardAssignmentScope;
  facilityId?: string | null;
  userId?: string | null;
  targetRole: UserRole;
  priority?: number;
}

export interface ResolvedAssignment {
  savedDashboardId: string;
  assignmentId: string;
  scope: DashboardAssignmentScope;
}

export interface DashboardAssignment {
  id: string;
  saved_dashboard_id: string;
  scope: DashboardAssignmentScope;
  facility_id: string | null;
  user_id: string | null;
  target_role: string;
  priority: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

const SCOPE_PRIORITY: Record<DashboardAssignmentScope, number> = {
  user: 300,
  facility: 200,
  global: 100,
};

export class SavedDashboardModel extends BaseModel {
  protected static override get tableName(): string {
    return 'saved_dashboards';
  }

  private static parseSnapshot(raw: unknown): DashboardSnapshot {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as DashboardSnapshot).pages)
    ) {
      throw new Error('Invalid saved dashboard snapshot');
    }
    return parsed as DashboardSnapshot;
  }

  private static countSnapshotPagesAndWidgets(snapshot: DashboardSnapshot): {
    pageCount: number;
    widgetCount: number;
  } {
    const pageCount = snapshot.pages.length;
    const widgetCount = snapshot.pages.reduce(
      (sum, p) => sum + (p.widgets?.length ?? 0),
      0
    );
    return { pageCount, widgetCount };
  }

  public static async listAll(): Promise<SavedDashboardListItem[]> {
    const rows = (await this.db(this.tableName)
      .select(
        `${this.tableName}.id`,
        `${this.tableName}.name`,
        `${this.tableName}.description`,
        `${this.tableName}.page_count`,
        `${this.tableName}.widget_count`,
        `${this.tableName}.created_by`,
        `${this.tableName}.updated_at`,
        'users.email as created_by_email'
      )
      .leftJoin('users', `${this.tableName}.created_by`, 'users.id')
      .orderBy(`${this.tableName}.updated_at`, 'desc')) as Array<
      SavedDashboard & { created_by_email?: string }
    >;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      pageCount: row.page_count ?? 0,
      widgetCount: row.widget_count ?? 0,
      createdBy: row.created_by,
      createdByEmail: row.created_by_email,
      updatedAt: row.updated_at,
    }));
  }

  public static async findById(id: string): Promise<SavedDashboard | undefined> {
    return this.query().where('id', id).first() as Promise<SavedDashboard | undefined>;
  }

  public static async findByName(name: string): Promise<SavedDashboard | undefined> {
    return this.query()
      .where('name', name)
      .first() as Promise<SavedDashboard | undefined>;
  }

  public static async createFromUserWorkingLayout(
    userId: string,
    name: string,
    description?: string | null
  ): Promise<SavedDashboard> {
    const pages = await workingLayoutToPayload(userId);
    const { pages: clamped, error } = clampAndValidatePages(pages);
    if (error) {
      throw new Error(error);
    }
    if (clamped.length === 0) {
      throw new Error('Cannot save an empty dashboard');
    }

    const snapshot: DashboardSnapshot = { version: 1, pages: clamped };
    const { pageCount, widgetCount } = this.countSnapshotPagesAndWidgets(snapshot);
    return this.create({
      name: name.trim(),
      description: description?.trim() || null,
      snapshot: JSON.stringify(snapshot),
      page_count: pageCount,
      widget_count: widgetCount,
      created_by: userId,
      updated_by: userId,
    }) as Promise<SavedDashboard>;
  }

  public static async updateSnapshotFromUserWorkingLayout(
    id: string,
    userId: string
  ): Promise<SavedDashboard> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Saved dashboard not found');
    }

    const pages = await workingLayoutToPayload(userId);
    const { pages: clamped, error } = clampAndValidatePages(pages);
    if (error) {
      throw new Error(error);
    }
    if (clamped.length === 0) {
      throw new Error('Cannot save an empty dashboard');
    }

    const snapshot: DashboardSnapshot = { version: 1, pages: clamped };
    const { pageCount, widgetCount } = this.countSnapshotPagesAndWidgets(snapshot);

    await this.query()
      .where('id', id)
      .update({
        snapshot: JSON.stringify(snapshot),
        page_count: pageCount,
        widget_count: widgetCount,
        updated_by: userId,
        updated_at: this.db.fn.now(),
      });

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Saved dashboard not found');
    }
    return updated;
  }

  public static async updateMetadata(
    id: string,
    userId: string,
    updates: { name?: string; description?: string | null }
  ): Promise<SavedDashboard | undefined> {
    const patch: Record<string, unknown> = {
      updated_by: userId,
    };
    if (updates.name !== undefined) {
      patch.name = updates.name.trim();
    }
    if (updates.description !== undefined) {
      patch.description = updates.description?.trim() || null;
    }
    await this.query()
      .where('id', id)
      .update({
        ...patch,
        updated_at: this.db.fn.now(),
      });
    return this.findById(id);
  }

  public static async loadIntoUserWorkingLayout(
    savedDashboardId: string,
    userId: string
  ): Promise<DashboardPagePayload[]> {
    const saved = await this.findById(savedDashboardId);
    if (!saved) {
      throw new Error('Saved dashboard not found');
    }
    const snapshot = this.parseSnapshot(saved.snapshot);
    const { pages, error } = clampAndValidatePages(snapshot.pages);
    if (error) {
      throw new Error(error);
    }
    await UserWidgetLayoutModel.saveDashboardState(userId, pages);
    return pages;
  }

  public static async countAssignmentsReferencing(id: string): Promise<number> {
    const row = await this.db('dashboard_assignments')
      .where('saved_dashboard_id', id)
      .count('* as count')
      .first();
    return Number((row as { count?: number | string })?.count ?? 0);
  }
}

/**
 * Dashboard assignment rules — hierarchical resolution: user > facility > global.
 */
export class DashboardAssignmentModel extends BaseModel {
  protected static override get tableName(): string {
    return 'dashboard_assignments';
  }

  private static pickBest(rows: DashboardAssignment[]): DashboardAssignment | undefined {
    if (rows.length === 0) return undefined;
    return [...rows].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })[0];
  }

  public static async listAll(): Promise<DashboardAssignmentListItem[]> {
    const rows = (await this.db(`${this.tableName} as da`)
      .select(
        'da.id',
        'da.saved_dashboard_id',
        'da.scope',
        'da.facility_id',
        'da.user_id',
        'da.target_role',
        'da.priority',
        'da.created_by',
        'da.updated_at',
        'sd.name as saved_dashboard_name',
        'f.name as facility_name',
        'u.email as user_email',
        'u.first_name as user_first_name',
        'u.last_name as user_last_name'
      )
      .join('saved_dashboards as sd', 'da.saved_dashboard_id', 'sd.id')
      .leftJoin('facilities as f', 'da.facility_id', 'f.id')
      .leftJoin('users as u', 'da.user_id', 'u.id')
      .orderBy('da.updated_at', 'desc')) as Array<{
      id: string;
      saved_dashboard_id: string;
      scope: DashboardAssignmentScope;
      facility_id: string | null;
      user_id: string | null;
      target_role: string;
      priority: number;
      created_by: string;
      updated_at: Date;
      saved_dashboard_name: string;
      facility_name: string | null;
      user_email: string | null;
      user_first_name: string | null;
      user_last_name: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      savedDashboardId: row.saved_dashboard_id,
      savedDashboardName: row.saved_dashboard_name,
      scope: row.scope,
      facilityId: row.facility_id,
      facilityName: row.facility_name,
      userId: row.user_id,
      userEmail: row.user_email,
      userName:
        row.user_first_name || row.user_last_name
          ? `${row.user_first_name ?? ''} ${row.user_last_name ?? ''}`.trim()
          : null,
      targetRole: row.target_role,
      priority: row.priority,
      createdBy: row.created_by,
      updatedAt: row.updated_at,
    }));
  }

  public static async findById(id: string): Promise<DashboardAssignment | undefined> {
    return this.query().where('id', id).first() as Promise<
      DashboardAssignment | undefined
    >;
  }

  public static async createAssignment(
    createdBy: string,
    payload: CreateAssignmentPayload
  ): Promise<DashboardAssignment> {
    const saved = await SavedDashboardModel.findById(payload.savedDashboardId);
    if (!saved) {
      throw new Error('Saved dashboard not found');
    }

    const facilityId =
      payload.scope === 'facility' ? payload.facilityId ?? null : null;
    const userId = payload.scope === 'user' ? payload.userId ?? null : null;

    if (payload.scope === 'global' && (facilityId || userId)) {
      throw new Error('Global assignments cannot specify facility or user');
    }
    if (payload.scope === 'user' && !userId) {
      throw new Error('User assignments require userId');
    }

    if (payload.scope === 'user' && userId) {
      const user = (await UserModel.findById(userId)) as User | undefined;
      if (!user) {
        throw new Error('User not found');
      }
      if (user.role !== payload.targetRole) {
        throw new Error(
          `User role (${user.role}) does not match target role (${payload.targetRole})`
        );
      }
    }

    if (payload.scope === 'facility' && facilityId) {
      const facilityModel = new FacilityModel();
      const facility = await facilityModel.findById(facilityId);
      if (!facility) {
        throw new Error('Facility not found');
      }
    }

    const existing = await this.query()
      .where({
        target_role: payload.targetRole,
        scope: payload.scope,
      })
      .where((qb) => {
        if (payload.scope === 'user') {
          qb.where('user_id', userId);
        } else if (payload.scope === 'facility') {
          if (facilityId) {
            qb.where('facility_id', facilityId);
          } else {
            qb.whereNull('facility_id');
          }
        } else {
          qb.whereNull('facility_id').whereNull('user_id');
        }
      })
      .first();

    if (existing) {
      throw new Error(
        'An assignment already exists for this role and scope target'
      );
    }

    return this.create({
      saved_dashboard_id: payload.savedDashboardId,
      scope: payload.scope,
      facility_id: facilityId,
      user_id: userId,
      target_role: payload.targetRole,
      priority: payload.priority ?? 0,
      created_by: createdBy,
      scope_entity_id: computeScopeEntityId(payload.scope, facilityId, userId),
    }) as Promise<DashboardAssignment>;
  }

  public static async updateAssignment(
    id: string,
    updates: {
      savedDashboardId?: string;
      priority?: number;
    }
  ): Promise<DashboardAssignment | undefined> {
    const patch: Record<string, unknown> = { updated_at: this.db.fn.now() };
    if (updates.savedDashboardId !== undefined) {
      const saved = await SavedDashboardModel.findById(updates.savedDashboardId);
      if (!saved) throw new Error('Saved dashboard not found');
      patch.saved_dashboard_id = updates.savedDashboardId;
    }
    if (updates.priority !== undefined) {
      patch.priority = updates.priority;
    }
    await this.query().where('id', id).update(patch);
    return this.findById(id);
  }

  public static async deleteById(id: string): Promise<number> {
    return this.query().where('id', id).delete();
  }

  public static async resolveAssignment(
    userId: string,
    role: string,
    facilityContext: ActiveFacilityContext
  ): Promise<ResolvedAssignment | null> {
    const userRows = (await this.query()
      .where({ user_id: userId, target_role: role, scope: 'user' })
      .select('*')) as DashboardAssignment[];
    const userMatch = this.pickBest(userRows);
    if (userMatch) {
      return {
        savedDashboardId: userMatch.saved_dashboard_id,
        assignmentId: userMatch.id,
        scope: 'user',
      };
    }

    let facilityQuery = this.query()
      .where({ target_role: role, scope: 'facility' });
    if (facilityContext.mode === 'all') {
      facilityQuery = facilityQuery.whereNull('facility_id');
    } else if (facilityContext.facilityId) {
      facilityQuery = facilityQuery.where('facility_id', facilityContext.facilityId);
    } else {
      facilityQuery = facilityQuery.whereNull('facility_id');
    }
    const facilityRows = (await facilityQuery.select('*')) as DashboardAssignment[];
    const facilityMatch = this.pickBest(facilityRows);
    if (facilityMatch) {
      return {
        savedDashboardId: facilityMatch.saved_dashboard_id,
        assignmentId: facilityMatch.id,
        scope: 'facility',
      };
    }

    const globalRows = (await this.query()
      .where({ target_role: role, scope: 'global' })
      .select('*')) as DashboardAssignment[];
    const globalMatch = this.pickBest(globalRows);
    if (globalMatch) {
      return {
        savedDashboardId: globalMatch.saved_dashboard_id,
        assignmentId: globalMatch.id,
        scope: 'global',
      };
    }

    return null;
  }

  public static async findAffectedUserIds(
    assignment: Pick<
      DashboardAssignment,
      'scope' | 'facility_id' | 'user_id' | 'target_role' | 'saved_dashboard_id'
    >
  ): Promise<string[]> {
    if (assignment.scope === 'user' && assignment.user_id) {
      return [assignment.user_id];
    }
    if (assignment.scope === 'facility') {
      if (assignment.facility_id) {
        const users = await UserModel.findByRoleMinimalForFacility(
          assignment.target_role as UserRole,
          assignment.facility_id
        );
        return users.map((u) => u.id);
      }
      const users = await UserModel.findByRole(assignment.target_role as UserRole);
      return users.map((u) => u.id);
    }
    const users = await UserModel.findByRole(assignment.target_role as UserRole);
    return users.map((u) => u.id);
  }

  public static async findUserIdsForSavedDashboard(
    savedDashboardId: string
  ): Promise<string[]> {
    const assignments = (await this.query()
      .where('saved_dashboard_id', savedDashboardId)
      .select('*')) as DashboardAssignment[];
    const ids = new Set<string>();
    for (const assignment of assignments) {
      const affected = await this.findAffectedUserIds(assignment);
      affected.forEach((id) => ids.add(id));
    }
    return Array.from(ids);
  }

  /** @deprecated use resolveAssignment */
  public static async resolveAssignedDashboardId(
    userId: string,
    role: string,
    _facilityIds: string[],
    facilityContext?: ActiveFacilityContext
  ): Promise<string | null> {
    const ctx = facilityContext ?? { mode: 'all' as const };
    const resolved = await this.resolveAssignment(userId, role, ctx);
    return resolved?.savedDashboardId ?? null;
  }

  public static scopePriority(scope: DashboardAssignmentScope): number {
    return SCOPE_PRIORITY[scope];
  }
}
