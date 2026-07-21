export interface GasNomsRoleDetail {
  locationRoleId: number;
  role: string;
  roleCode: string;
  sign: number | null;
}

export interface GasNomsMapLocationRow {
  location_id: number;
  pipeline_id?: number | null;
  pipeline_name?: string | null;
  pipeline_short_name?: string | null;
  tariff_zone?: string | null;
  tz_id?: number | null;
  state?: string | null;
  county?: string | null;
  loc_name?: string | null;
  facility?: string | null;
  interconnecting_entity?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_role_count?: number | null;
  location_role_ids?: string | null;
  role_details?: string | null;
}

export interface GasNomsImportPreviewRow {
  locationId: number;
  pipelineId: number | null;
  pipeline: string;
  locationName: string;
  facility: string;
  tariffZone: string;
  county: string;
  state: string;
  roleCount: number;
  roles: GasNomsRoleDetail[];
}

export interface GasNomsImportPreview {
  importedLocationIds: number[];
  matchedLocationIds: number[];
  unmatchedLocationIds: number[];
  rows: GasNomsImportPreviewRow[];
  locationRoleIds: number[];
  roleCounts: Record<string, number>;
}

export function parseGasNomsRoleDetails(raw: string | null | undefined): GasNomsRoleDetail[] {
  if (!raw) return [];

  return raw
    .split("|")
    .map((part) => {
      const [idRaw, role = "", roleCode = "", signRaw = ""] = part.split(":");
      const locationRoleId = Number.parseInt(idRaw, 10);
      if (!Number.isInteger(locationRoleId) || locationRoleId <= 0) return null;

      const sign = Number.parseInt(signRaw, 10);
      return {
        locationRoleId,
        role,
        roleCode,
        sign: Number.isInteger(sign) ? sign : null,
      };
    })
    .filter((item): item is GasNomsRoleDetail => item !== null);
}

function locationRowKey(row: GasNomsMapLocationRow): string {
  return `${row.pipeline_id ?? "none"}:${row.location_id}`;
}

function roleCountKey(role: GasNomsRoleDetail): string {
  return role.roleCode || role.role || "Unknown";
}

export function normalizeGasNomsImport(
  importedLocationIds: readonly number[],
  locations: readonly GasNomsMapLocationRow[]
): GasNomsImportPreview {
  const rowsByLocation = new Map<number, GasNomsMapLocationRow[]>();
  const seenRows = new Set<string>();

  for (const row of locations) {
    if (!Number.isInteger(row.location_id)) continue;
    const key = locationRowKey(row);
    if (seenRows.has(key)) continue;
    seenRows.add(key);

    const rows = rowsByLocation.get(row.location_id) ?? [];
    rows.push(row);
    rowsByLocation.set(row.location_id, rows);
  }

  const previewRows: GasNomsImportPreviewRow[] = [];
  const matchedLocationIds: number[] = [];
  const unmatchedLocationIds: number[] = [];
  const roleIds = new Set<number>();
  const roleCounts: Record<string, number> = {};

  for (const locationId of importedLocationIds) {
    const matchedRows = rowsByLocation.get(locationId) ?? [];
    if (matchedRows.length === 0) {
      unmatchedLocationIds.push(locationId);
      continue;
    }

    matchedLocationIds.push(locationId);
    for (const row of matchedRows) {
      const roles = parseGasNomsRoleDetails(row.role_details);
      for (const role of roles) {
        roleIds.add(role.locationRoleId);
        const key = roleCountKey(role);
        roleCounts[key] = (roleCounts[key] ?? 0) + 1;
      }

      previewRows.push({
        locationId: row.location_id,
        pipelineId: row.pipeline_id ?? null,
        pipeline: row.pipeline_short_name ?? row.pipeline_name ?? "--",
        locationName: row.loc_name ?? `Location ${row.location_id}`,
        facility: row.facility ?? "--",
        tariffZone: row.tariff_zone ?? "--",
        county: row.county ?? "--",
        state: row.state ?? "--",
        roleCount: roles.length,
        roles,
      });
    }
  }

  return {
    importedLocationIds: [...importedLocationIds],
    matchedLocationIds,
    unmatchedLocationIds,
    rows: previewRows,
    locationRoleIds: Array.from(roleIds),
    roleCounts,
  };
}
