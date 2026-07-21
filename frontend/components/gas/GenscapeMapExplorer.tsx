"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import maplibregl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import GasNomsImportDialog from "@/components/gas/GasNomsImportDialog";
import type { GasNomsImportPreview } from "@/lib/gas-noms-import";

interface PipelineRow {
  pipeline_id: number;
  pipeline_name: string | null;
  pipeline_short_name: string;
  mapped_location_count: number;
  location_role_count: number;
}

interface RoleDetail {
  location_role_id: number;
  role: string;
  role_code: string;
  sign: number | null;
}

interface WatchlistApiRow {
  watchlist_id: number;
  slug: string;
  display_name: string;
  location_role_ids: number[];
  sign_overrides?: Record<string, number>;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

type SourceKind = "pipeline" | "search" | "import";

interface MapLocationRow {
  location_id: number;
  pipeline_id: number | null;
  pipeline_name: string | null;
  pipeline_short_name: string | null;
  tariff_zone: string | null;
  tz_id: number | null;
  state: string | null;
  county: string | null;
  loc_name: string | null;
  facility: string | null;
  interconnecting_entity: string | null;
  latitude: number;
  longitude: number;
  location_role_count: number;
  location_role_ids: string | null;
  role_details: string | null;
  sourceKind?: SourceKind;
  sourceLabel?: string;
}

interface MapSearchResponse {
  pipelines?: PipelineRow[];
  locations?: MapLocationRow[];
}

interface LocationsResponse {
  locations?: MapLocationRow[];
  location_count?: number;
}

type FeatureProperties = {
  key: string;
  locationId: number;
  pipeline: string;
  label: string;
  sourceKind: SourceKind;
};

type MapTheme = "dark" | "light";
type EiaStorageRegion = "East" | "Midwest" | "Mountain" | "Pacific" | "South Central";

const MAP_SOURCE_ID = "genscape-rt-points";
const SELECTED_SOURCE_ID = "genscape-rt-selected-points";
const EIA_REGION_SOURCE_ID = "eia-storage-regions";
const EIA_REGION_LABEL_SOURCE_ID = "eia-storage-region-labels";
const EIA_REGION_LAYER_IDS = ["eia-region-fill", "eia-region-line", "eia-region-label"];
const BASEMAP_ATTRIBUTION = "&copy; OpenStreetMap contributors &copy; CARTO";
const BASEMAP_MAX_ZOOM = 20;
const BASEMAP_LAYER_MAX_ZOOM = 24;
const CARTO_TILE_SCALE = "@2x";
const ROLE_ID_CHUNK_SIZE = 400;

const EIA_REGION_COLORS: Record<EiaStorageRegion, string> = {
  East: "#ec4899",
  Midwest: "#14b8a6",
  Mountain: "#fb923c",
  Pacific: "#60a5fa",
  "South Central": "#22c55e",
};

const EIA_REGION_LABELS: GeoJSON.FeatureCollection<
  GeoJSON.Point,
  { eiaRegion: EiaStorageRegion }
> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-78.5, 38.5] },
      properties: { eiaRegion: "East" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-89.5, 42] },
      properties: { eiaRegion: "Midwest" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-108.5, 43.5] },
      properties: { eiaRegion: "Mountain" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-121.5, 44] },
      properties: { eiaRegion: "Pacific" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-97.5, 32] },
      properties: { eiaRegion: "South Central" },
    },
  ],
};

function getMapStyle(theme: MapTheme): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      cartoLight: {
        type: "raster",
        tiles: [
          `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}${CARTO_TILE_SCALE}.png`,
        ],
        tileSize: 256,
        maxzoom: BASEMAP_MAX_ZOOM,
        attribution: BASEMAP_ATTRIBUTION,
      },
      cartoDark: {
        type: "raster",
        tiles: [
          `https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}${CARTO_TILE_SCALE}.png`,
        ],
        tileSize: 256,
        maxzoom: BASEMAP_MAX_ZOOM,
        attribution: BASEMAP_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: "carto-light",
        type: "raster",
        source: "cartoLight",
        minzoom: 0,
        maxzoom: BASEMAP_LAYER_MAX_ZOOM,
        layout: { visibility: theme === "light" ? "visible" : "none" },
        paint: {
          "raster-brightness-min": 0.12,
          "raster-brightness-max": 0.95,
          "raster-saturation": -0.12,
          "raster-contrast": 0.08,
        },
      },
      {
        id: "carto-dark",
        type: "raster",
        source: "cartoDark",
        minzoom: 0,
        maxzoom: BASEMAP_LAYER_MAX_ZOOM,
        layout: { visibility: theme === "dark" ? "visible" : "none" },
        paint: {
          "raster-brightness-min": 0.22,
          "raster-brightness-max": 1,
          "raster-saturation": -0.2,
          "raster-contrast": -0.05,
        },
      },
    ],
  };
}

function formatInt(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString();
}

function formatDateOffset(daysOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function parseRoleDetails(raw: string | null | undefined): RoleDetail[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((part) => {
      const [idRaw, role = "", roleCode = "", signRaw = ""] = part.split(":");
      const locationRoleId = Number.parseInt(idRaw, 10);
      if (!Number.isFinite(locationRoleId) || locationRoleId <= 0) return null;
      const sign = Number.parseInt(signRaw, 10);
      return {
        location_role_id: locationRoleId,
        role,
        role_code: roleCode,
        sign: Number.isFinite(sign) ? sign : null,
      };
    })
    .filter((item): item is RoleDetail => item !== null);
}

function roleIdsForPoint(point: MapLocationRow | null): number[] {
  return parseRoleDetails(point?.role_details).map((role) => role.location_role_id);
}

function pointKey(point: MapLocationRow): string {
  return `${point.pipeline_id ?? "none"}:${point.location_id}`;
}

function mapFeatureKey(point: MapLocationRow): string {
  return `${pointKey(point)}:${point.sourceKind ?? "pipeline"}`;
}

function uniquePoints(rows: MapLocationRow[]): MapLocationRow[] {
  const byKey = new Map<string, MapLocationRow>();
  for (const row of rows) {
    byKey.set(mapFeatureKey(row), row);
  }
  return Array.from(byKey.values());
}

function normalizePoint(row: MapLocationRow, sourceKind: SourceKind, sourceLabel: string): MapLocationRow {
  return { ...row, sourceKind, sourceLabel };
}

function getMapCoordinates(point: MapLocationRow): [number, number] | null {
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const validLatitude = latitude >= 10 && latitude <= 75;
  const validLongitude = longitude >= -170 && longitude <= -50;
  if (validLatitude && validLongitude) return [longitude, latitude];

  const swappedLatitude = longitude >= 10 && longitude <= 75;
  const swappedLongitude = latitude >= -170 && latitude <= -50;
  if (swappedLatitude && swappedLongitude) return [latitude, longitude];

  return null;
}

function buildGeoJson(
  points: MapLocationRow[],
): GeoJSON.FeatureCollection<GeoJSON.Point, FeatureProperties> {
  const features: GeoJSON.Feature<GeoJSON.Point, FeatureProperties>[] = [];

  for (const point of points) {
    const coordinates = getMapCoordinates(point);
    if (!coordinates) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates },
      properties: {
        key: mapFeatureKey(point),
        locationId: point.location_id,
        pipeline: point.pipeline_short_name ?? "",
        label: point.loc_name ?? `Location ${point.location_id}`,
        sourceKind: point.sourceKind ?? "pipeline",
      },
    });
  }

  return { type: "FeatureCollection", features };
}

function boundsFor(points: MapLocationRow[]): LngLatBoundsLike | null {
  const coordinates = points
    .map(getMapCoordinates)
    .filter((point): point is [number, number] => point !== null);
  if (coordinates.length === 0) return null;

  const lons = coordinates.map((point) => point[0]);
  const lats = coordinates.map((point) => point[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

async function fetchLocationsForRoleIds(roleIds: readonly number[]): Promise<MapLocationRow[]> {
  const rows: MapLocationRow[] = [];
  for (let index = 0; index < roleIds.length; index += ROLE_ID_CHUNK_SIZE) {
    const chunk = roleIds.slice(index, index + ROLE_ID_CHUNK_SIZE);
    const params = new URLSearchParams({
      locationRoleId: chunk.join(","),
      limit: String(Math.max(100, Math.min(5000, chunk.length * 4))),
    });
    const response = await fetch(`/api/map/locations?${params}`);
    const data = (await response.json().catch(() => ({}))) as LocationsResponse & {
      error?: string;
    };
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    rows.push(...(data.locations ?? []));
  }
  return rows;
}

function PanelSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-slate-800 last:border-b-0">
      <div className="flex items-center justify-between gap-3 px-3 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          {title}
        </h2>
        {count != null && (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
            {formatInt(count)}
          </span>
        )}
      </div>
      <div className="px-3 pb-3">{children}</div>
    </section>
  );
}

function pointLabel(point: MapLocationRow): string {
  return point.loc_name ?? `Location ${point.location_id}`;
}

export default function GenscapeMapExplorer() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const allPointsRef = useRef<MapLocationRow[]>([]);
  const [pipelines, setPipelines] = useState<PipelineRow[]>([]);
  const [watchlists, setWatchlists] = useState<WatchlistApiRow[]>([]);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState("");
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchPipelines, setSearchPipelines] = useState<PipelineRow[]>([]);
  const [searchPoints, setSearchPoints] = useState<MapLocationRow[]>([]);
  const [selectedPipelines, setSelectedPipelines] = useState<Set<string>>(() => new Set());
  const [pipelinePoints, setPipelinePoints] = useState<MapLocationRow[]>([]);
  const [selectedPointRows, setSelectedPointRows] = useState<Map<string, MapLocationRow>>(
    () => new Map(),
  );
  const [extraSelectedRoleIds, setExtraSelectedRoleIds] = useState<number[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<MapLocationRow | null>(null);
  const [mapTheme, setMapTheme] = useState<MapTheme>("dark");
  const [eiaRegionsVisible, setEiaRegionsVisible] = useState(true);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [loading, setLoading] = useState({
    pipelines: true,
    points: false,
    search: false,
    import: false,
    watchlists: true,
    save: false,
  });
  const [error, setError] = useState<string | null>(null);

  const isDarkMap = mapTheme === "dark";
  const themeVars = {
    "--rt-bg": isDarkMap ? "#020617" : "#f8fafc",
    "--rt-sidebar": isDarkMap ? "#0f172a" : "#f1f5f9",
    "--rt-surface": isDarkMap ? "#111827" : "#ffffff",
    "--rt-border": isDarkMap ? "#1f2937" : "#cbd5e1",
    "--rt-text": isDarkMap ? "#e2e8f0" : "#1f2937",
    "--rt-muted": isDarkMap ? "#94a3b8" : "#475569",
  } as CSSProperties;

  const filteredPipelines = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return pipelines;
    const matchedPipelineNames = new Set(
      [
        ...searchPipelines.map((pipeline) => pipeline.pipeline_short_name),
        ...searchPoints.map((point) => point.pipeline_short_name ?? ""),
      ].filter(Boolean),
    );
    return pipelines.filter(
      (pipeline) =>
        `${pipeline.pipeline_short_name} ${pipeline.pipeline_name ?? ""}`
          .toLowerCase()
          .includes(query) || matchedPipelineNames.has(pipeline.pipeline_short_name),
    );
  }, [pipelines, searchPipelines, searchPoints, searchTerm]);

  const selectedPipelineList = useMemo(
    () => Array.from(selectedPipelines).sort((a, b) => a.localeCompare(b)),
    [selectedPipelines],
  );

  const selectedPoints = useMemo(
    () => Array.from(selectedPointRows.values()),
    [selectedPointRows],
  );

  const allPoints = useMemo(
    () => uniquePoints([...pipelinePoints, ...searchPoints, ...selectedPoints]),
    [pipelinePoints, searchPoints, selectedPoints],
  );

  const selectedRoleIds = useMemo(() => {
    const ids = new Set<number>(extraSelectedRoleIds);
    for (const point of selectedPoints) {
      for (const roleId of roleIdsForPoint(point)) ids.add(roleId);
    }
    return Array.from(ids).sort((a, b) => a - b);
  }, [extraSelectedRoleIds, selectedPoints]);

  const selectedPointKeys = useMemo(
    () => new Set(selectedPoints.map(mapFeatureKey)),
    [selectedPoints],
  );

  const selectedRoles = useMemo(() => parseRoleDetails(selectedPoint?.role_details), [selectedPoint]);

  useEffect(() => {
    allPointsRef.current = allPoints;
  }, [allPoints]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/map/pipelines")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ pipelines?: PipelineRow[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setPipelines(data.pipelines ?? []);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load pipeline metadata.");
      })
      .finally(() => {
        if (!cancelled) setLoading((prev) => ({ ...prev, pipelines: false }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadWatchlists = useCallback(async () => {
    setLoading((prev) => ({ ...prev, watchlists: true }));
    try {
      const response = await fetch("/api/watchlists", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        watchlists?: WatchlistApiRow[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      const rows = [...(data.watchlists ?? [])].sort((a, b) =>
        a.display_name.localeCompare(b.display_name),
      );
      setWatchlists(rows);
      setSelectedWatchlistId((prev) => {
        if (prev && rows.some((watchlist) => String(watchlist.watchlist_id) === prev)) return prev;
        return rows[0] ? String(rows[0].watchlist_id) : "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load watchlists.");
    } finally {
      setLoading((prev) => ({ ...prev, watchlists: false }));
    }
  }, []);

  useEffect(() => {
    void loadWatchlists();
  }, [loadWatchlists]);

  useEffect(() => {
    const controller = new AbortController();
    const term = searchTerm.trim();
    if (term.length < 2) {
      setSearchPipelines([]);
      setSearchPoints([]);
      return () => controller.abort();
    }

    const timeoutId = window.setTimeout(() => {
      setLoading((prev) => ({ ...prev, search: true }));
      fetch(`/api/map/search?q=${encodeURIComponent(term)}&limit=25`, {
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json() as Promise<MapSearchResponse>;
        })
        .then((data) => {
          setSearchPipelines(data.pipelines ?? []);
          setSearchPoints(
            (data.locations ?? []).map((row) => normalizePoint(row, "search", "Search")),
          );
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
        })
        .finally(() => setLoading((prev) => ({ ...prev, search: false })));
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchTerm]);

  useEffect(() => {
    const controller = new AbortController();
    if (selectedPipelineList.length === 0) {
      setPipelinePoints([]);
      return () => controller.abort();
    }

    const params = new URLSearchParams({
      pipeline: selectedPipelineList.join(","),
      limit: "5000",
    });
    setLoading((prev) => ({ ...prev, points: true }));
    fetch(`/api/map/locations?${params}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<LocationsResponse>;
      })
      .then((data) => {
        const rows = (data.locations ?? []).map((row) =>
          normalizePoint(row, "pipeline", "Pipeline"),
        );
        setPipelinePoints(rows);
        setSelectedPointRows((prev) => {
          const next = new Map(prev);
          for (const row of rows) next.set(mapFeatureKey(row), row);
          return next;
        });
        setError(null);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to load selected pipeline map points.");
      })
      .finally(() => setLoading((prev) => ({ ...prev, points: false })));

    return () => controller.abort();
  }, [selectedPipelineList]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getMapStyle("dark"),
      center: [-98.5, 39.5],
      zoom: 3.15,
      attributionControl: false,
      fadeDuration: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

    map.on("load", () => {
      map.addSource(EIA_REGION_SOURCE_ID, {
        type: "geojson",
        data: "/maps/eia-storage-regions.geojson",
      });

      map.addLayer({
        id: "eia-region-fill",
        type: "fill",
        source: EIA_REGION_SOURCE_ID,
        paint: {
          "fill-color": [
            "match",
            ["get", "eiaRegion"],
            "East",
            EIA_REGION_COLORS.East,
            "Midwest",
            EIA_REGION_COLORS.Midwest,
            "Mountain",
            EIA_REGION_COLORS.Mountain,
            "Pacific",
            EIA_REGION_COLORS.Pacific,
            "South Central",
            EIA_REGION_COLORS["South Central"],
            "#64748b",
          ],
          "fill-opacity": 0.14,
        },
      });

      map.addLayer({
        id: "eia-region-line",
        type: "line",
        source: EIA_REGION_SOURCE_ID,
        paint: {
          "line-color": [
            "match",
            ["get", "eiaRegion"],
            "East",
            EIA_REGION_COLORS.East,
            "Midwest",
            EIA_REGION_COLORS.Midwest,
            "Mountain",
            EIA_REGION_COLORS.Mountain,
            "Pacific",
            EIA_REGION_COLORS.Pacific,
            "South Central",
            EIA_REGION_COLORS["South Central"],
            "#64748b",
          ],
          "line-opacity": 0.68,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.7, 6, 1.4, 9, 2],
        },
      });

      map.addSource(EIA_REGION_LABEL_SOURCE_ID, {
        type: "geojson",
        data: EIA_REGION_LABELS,
      });

      map.addLayer({
        id: "eia-region-label",
        type: "symbol",
        source: EIA_REGION_LABEL_SOURCE_ID,
        minzoom: 2,
        maxzoom: 7.5,
        layout: {
          "text-field": ["get", "eiaRegion"],
          "text-font": ["Open Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 6, 14],
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "rgba(255,255,255,0.86)",
          "text-halo-width": 1.4,
        },
      });

      map.addSource(MAP_SOURCE_ID, {
        type: "geojson",
        data: buildGeoJson([]),
        cluster: true,
        clusterRadius: 42,
      });

      map.addSource(SELECTED_SOURCE_ID, {
        type: "geojson",
        data: buildGeoJson([]),
      });

      map.addLayer({
        id: "metadata-clusters",
        type: "circle",
        source: MAP_SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#0ea5e9",
          "circle-radius": ["step", ["get", "point_count"], 15, 25, 21, 100, 29],
          "circle-opacity": 0.82,
          "circle-stroke-color": "#e5e7eb",
          "circle-stroke-width": 1,
        },
      });

      map.addLayer({
        id: "metadata-cluster-count",
        type: "symbol",
        source: MAP_SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
          "text-font": ["Open Sans Regular"],
        },
        paint: { "text-color": "#f8fafc" },
      });

      map.addLayer({
        id: "metadata-point-dot",
        type: "circle",
        source: MAP_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "sourceKind"],
            "search",
            "#f59e0b",
            "import",
            "#a855f7",
            "#22c55e",
          ],
          "circle-radius": 7,
          "circle-opacity": 0.92,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });

      map.addLayer({
        id: "selected-point-ring",
        type: "circle",
        source: SELECTED_SOURCE_ID,
        paint: {
          "circle-color": "rgba(245, 158, 11, 0.12)",
          "circle-radius": 14,
          "circle-stroke-color": "#f59e0b",
          "circle-stroke-width": 2,
        },
      });

      map.on("click", "metadata-point-dot", (event: MapLayerMouseEvent) => {
        const key = event.features?.[0]?.properties?.key as string | undefined;
        const point = allPointsRef.current.find((row) => mapFeatureKey(row) === key);
        if (point) setSelectedPoint(point);
      });

      map.on("click", "metadata-clusters", (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        const source = map.getSource(MAP_SOURCE_ID) as GeoJSONSource | undefined;
        if (!source || !feature || clusterId == null) return;
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          if (zoom == null) return;
          map.easeTo({
            center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom,
          });
        });
      });

      for (const layerId of ["metadata-point-dot", "metadata-clusters"]) {
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyTheme = () => {
      map.setLayoutProperty("carto-light", "visibility", mapTheme === "light" ? "visible" : "none");
      map.setLayoutProperty("carto-dark", "visibility", mapTheme === "dark" ? "visible" : "none");
    };

    if (map.isStyleLoaded()) applyTheme();
    else map.once("load", applyTheme);
  }, [mapTheme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      const source = map.getSource(MAP_SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(buildGeoJson(allPoints));
      const selectedSource = map.getSource(SELECTED_SOURCE_ID) as GeoJSONSource | undefined;
      selectedSource?.setData(
        buildGeoJson(allPoints.filter((point) => selectedPointKeys.has(mapFeatureKey(point)))),
      );
    };

    if (map.isStyleLoaded()) update();
    else map.once("load", update);
  }, [allPoints, selectedPointKeys]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || allPoints.length === 0) return;
    const bounds = boundsFor(allPoints);
    if (!bounds) return;
    map.fitBounds(bounds, { padding: 80, maxZoom: 8.5, duration: 600 });
  }, [allPoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      for (const layerId of EIA_REGION_LAYER_IDS) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", eiaRegionsVisible ? "visible" : "none");
        }
      }
    };

    if (map.isStyleLoaded()) update();
    else map.once("load", update);
  }, [eiaRegionsVisible]);

  const togglePipeline = useCallback((pipelineShortName: string) => {
    setSelectedPipelines((prev) => {
      const next = new Set(prev);
      if (next.has(pipelineShortName)) {
        next.delete(pipelineShortName);
        setSelectedPointRows((rows) => {
          const nextRows = new Map(rows);
          for (const [key, row] of nextRows) {
            if (row.pipeline_short_name === pipelineShortName && row.sourceKind === "pipeline") {
              nextRows.delete(key);
            }
          }
          return nextRows;
        });
      } else {
        next.add(pipelineShortName);
      }
      return next;
    });
  }, []);

  const togglePoint = useCallback((point: MapLocationRow) => {
    const key = mapFeatureKey(point);
    setSelectedPoint(point);
    setSelectedPointRows((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, point);
      return next;
    });
  }, []);

  const removePoint = useCallback((point: MapLocationRow) => {
    const key = mapFeatureKey(point);
    setSelectedPointRows((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPipelines(new Set());
    setPipelinePoints([]);
    setSelectedPointRows(new Map());
    setExtraSelectedRoleIds([]);
    setSelectedPoint(null);
    setError(null);
  }, []);

  const applyImport = useCallback(async (preview: GasNomsImportPreview) => {
    if (preview.locationRoleIds.length === 0) return;
    setLoading((prev) => ({ ...prev, import: true }));
    try {
      const rows = await fetchLocationsForRoleIds(preview.locationRoleIds);
      const imported = rows.map((row) => normalizePoint(row, "import", "Import"));
      setSelectedPointRows((prev) => {
        const next = new Map(prev);
        for (const row of imported) next.set(mapFeatureKey(row), row);
        return next;
      });
      setExtraSelectedRoleIds(preview.locationRoleIds);
      setImportDialogOpen(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply imported selection.");
    } finally {
      setLoading((prev) => ({ ...prev, import: false }));
    }
  }, []);

  const applyWatchlist = useCallback(
    async (watchlistId: string) => {
      setSelectedWatchlistId(watchlistId);
      const watchlist = watchlists.find((item) => String(item.watchlist_id) === watchlistId);
      if (!watchlist || watchlist.location_role_ids.length === 0) return;

      setLoading((prev) => ({ ...prev, import: true }));
      try {
        const rows = await fetchLocationsForRoleIds(watchlist.location_role_ids);
        const imported = rows.map((row) =>
          normalizePoint(row, "import", watchlist.display_name),
        );
        setSelectedPointRows((prev) => {
          const next = new Map(prev);
          for (const row of imported) next.set(mapFeatureKey(row), row);
          return next;
        });
        setExtraSelectedRoleIds(watchlist.location_role_ids);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load watchlist selection.");
      } finally {
        setLoading((prev) => ({ ...prev, import: false }));
      }
    },
    [watchlists],
  );

  const saveRoleIdsAsWatchlist = useCallback(
    async (name: string, roleIds: readonly number[]) => {
      const trimmed = name.trim();
      if (!trimmed) {
        setError("Watchlist name is required.");
        return;
      }
      if (roleIds.length === 0) {
        setError("Select at least one role before saving a watchlist.");
        return;
      }

      setLoading((prev) => ({ ...prev, save: true }));
      try {
        const response = await fetch("/api/watchlists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmed,
            locationRoleIds: roleIds,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          watchlist?: WatchlistApiRow;
          error?: string;
        };
        if (!response.ok || !data.watchlist) {
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }
        const created = data.watchlist;
        setWatchlists((prev) =>
          [...prev.filter((item) => item.watchlist_id !== created.watchlist_id), created].sort(
            (a, b) => a.display_name.localeCompare(b.display_name),
          ),
        );
        setSelectedWatchlistId(String(created.watchlist_id));
        setNewWatchlistName("");
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save watchlist.");
        throw err;
      } finally {
        setLoading((prev) => ({ ...prev, save: false }));
      }
    },
    [],
  );

  const saveImportAsWatchlist = useCallback(
    async (preview: GasNomsImportPreview, name: string) => {
      await saveRoleIdsAsWatchlist(name, preview.locationRoleIds);
      setImportDialogOpen(false);
    },
    [saveRoleIdsAsWatchlist],
  );

  const saveCurrentSelectionAsWatchlist = useCallback(async () => {
    await saveRoleIdsAsWatchlist(newWatchlistName, selectedRoleIds);
  }, [newWatchlistName, saveRoleIdsAsWatchlist, selectedRoleIds]);

  const openNomsReport = useCallback(() => {
    if (selectedRoleIds.length === 0) return;
    const name =
      selectedPipelineList.length === 1
        ? `${selectedPipelineList[0]} RT selection`
        : selectedPipelineList.length > 1
          ? `${selectedPipelineList.length} pipelines RT selection`
          : `${selectedPoints.length.toLocaleString()} RT points`;
    const payload = {
      id: "rt-session-selection",
      name,
      locationRoleIds: selectedRoleIds,
      signOverrides: {},
      source: "custom",
      createdAt: new Date().toISOString(),
    };
    const params = new URLSearchParams({
      section: "noms",
      selectionSource: "session",
      selectionName: name,
      start: formatDateOffset(-6),
      end: formatDateOffset(0),
    });

    try {
      window.sessionStorage.setItem("genscape-noms-selection", JSON.stringify(payload));
      window.location.assign(`/?${params.toString()}`);
    } catch {
      params.delete("selectionSource");
      params.set("locationRoleId", selectedRoleIds.slice(0, 300).join(","));
      window.location.assign(`/?${params.toString()}`);
    }
  }, [selectedPipelineList, selectedPoints.length, selectedRoleIds]);

  return (
    <div
      className="min-h-[760px] overflow-hidden border border-slate-800 bg-[var(--rt-bg)]"
      style={themeVars}
    >
      <div className="flex min-h-[760px] flex-col lg:flex-row">
        <aside className="flex max-h-[760px] w-full shrink-0 flex-col border-b border-slate-800 bg-[var(--rt-sidebar)] lg:w-[390px] lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-2">
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setImportDialogOpen(true)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => void loadWatchlists()}
              disabled={loading.watchlists}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              Refresh Lists
            </button>
            <button
              type="button"
              onClick={openNomsReport}
              disabled={selectedRoleIds.length === 0}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              Open Noms
            </button>
            <button
              type="button"
              onClick={() => setMapTheme((value) => (value === "dark" ? "light" : "dark"))}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              {isDarkMap ? "Light" : "Dark"}
            </button>
            <button
              type="button"
              onClick={() => setEiaRegionsVisible((value) => !value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              {eiaRegionsVisible ? "Hide EIA" : "Show EIA"}
            </button>
          </div>

          <div className="border-b border-slate-800 p-3">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search pipeline, location, loc ID, role ID"
              className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-500"
            />
            <div className="mt-2 grid gap-2">
              <select
                value={selectedWatchlistId}
                onChange={(event) => void applyWatchlist(event.target.value)}
                disabled={loading.watchlists}
                className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                <option value="">
                  {loading.watchlists ? "Loading watchlists..." : "Load watchlist"}
                </option>
                {watchlists.map((watchlist) => (
                  <option key={watchlist.watchlist_id} value={String(watchlist.watchlist_id)}>
                    {watchlist.display_name} ({watchlist.location_role_ids.length.toLocaleString()})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  value={newWatchlistName}
                  onChange={(event) => setNewWatchlistName(event.target.value)}
                  placeholder="New watchlist name"
                  className="h-9 min-w-0 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => void saveCurrentSelectionAsWatchlist()}
                  disabled={loading.save || selectedRoleIds.length === 0 || !newWatchlistName.trim()}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                >
                  Save
                </button>
              </div>
            </div>
            {error && (
              <p className="mt-2 rounded-md border border-red-500/30 bg-red-950/30 px-2 py-1.5 text-xs text-red-200">
                {error}
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <PanelSection
              title="Search Results"
              count={searchPipelines.length + searchPoints.length}
            >
              {searchTerm.trim().length < 2 ? (
                <p className="text-sm text-slate-500">No search.</p>
              ) : loading.search ? (
                <p className="text-sm text-slate-500">Searching...</p>
              ) : (
                <div className="space-y-2">
                  {searchPipelines.slice(0, 8).map((pipeline) => (
                    <button
                      key={`search-pipeline-${pipeline.pipeline_id}`}
                      type="button"
                      onClick={() => togglePipeline(pipeline.pipeline_short_name)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-800/70"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-100">
                        {pipeline.pipeline_short_name}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {formatInt(pipeline.mapped_location_count)} pts
                      </span>
                    </button>
                  ))}
                  {searchPoints.slice(0, 12).map((point) => {
                    const key = mapFeatureKey(point);
                    const checked = selectedPointKeys.has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => togglePoint(point)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left ${
                          checked ? "bg-amber-500/10 ring-1 ring-amber-500/40" : "hover:bg-slate-800/70"
                        }`}
                      >
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            checked ? "bg-amber-400" : "bg-slate-600"
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-slate-100">
                            {pointLabel(point)}
                          </span>
                          <span className="block truncate text-[10px] text-slate-500">
                            {point.pipeline_short_name ?? "--"} | loc {point.location_id} |{" "}
                            {formatInt(point.location_role_count)} roles
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </PanelSection>

            <PanelSection title="Pipelines" count={filteredPipelines.length}>
              {loading.pipelines ? (
                <p className="text-sm text-slate-500">Loading pipelines...</p>
              ) : (
                <div className="space-y-1.5">
                  {filteredPipelines.slice(0, 120).map((pipeline) => {
                    const active = selectedPipelines.has(pipeline.pipeline_short_name);
                    return (
                      <button
                        key={pipeline.pipeline_id}
                        type="button"
                        onClick={() => togglePipeline(pipeline.pipeline_short_name)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left ${
                          active ? "bg-emerald-500/10 ring-1 ring-emerald-500/35" : "hover:bg-slate-800/70"
                        }`}
                      >
                        <span
                          className={`h-3 w-3 rounded-sm border ${
                            active ? "border-emerald-400 bg-emerald-500" : "border-slate-600"
                          }`}
                        />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-100">
                          {pipeline.pipeline_short_name}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {formatInt(pipeline.mapped_location_count)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </PanelSection>

            <PanelSection title="Selection" count={selectedRoleIds.length}>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2">
                  <p className="text-slate-500">Pipelines</p>
                  <p className="mt-1 font-mono text-slate-100">
                    {formatInt(selectedPipelineList.length)}
                  </p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2">
                  <p className="text-slate-500">Points</p>
                  <p className="mt-1 font-mono text-slate-100">{formatInt(selectedPoints.length)}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2">
                  <p className="text-slate-500">Roles</p>
                  <p className="mt-1 font-mono text-slate-100">
                    {formatInt(selectedRoleIds.length)}
                  </p>
                </div>
              </div>
              {loading.points || loading.import ? (
                <p className="mt-3 text-sm text-slate-500">Loading selection...</p>
              ) : selectedPoints.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No selected points.</p>
              ) : (
                <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {selectedPoints.slice(0, 80).map((point) => (
                    <div
                      key={`selected-${mapFeatureKey(point)}`}
                      className="flex items-center gap-2 rounded-md bg-slate-900/80 px-2 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedPoint(point)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-xs font-semibold text-slate-100">
                          {pointLabel(point)}
                        </span>
                        <span className="block truncate text-[10px] text-slate-500">
                          {point.pipeline_short_name ?? "--"} | {point.sourceLabel ?? "Selection"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removePoint(point)}
                        className="rounded px-1.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </PanelSection>

            <PanelSection title="Point Details" count={selectedRoles.length}>
              {!selectedPoint ? (
                <p className="text-sm text-slate-500">No point selected.</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">
                      {pointLabel(selectedPoint)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedPoint.pipeline_short_name ?? "--"} | loc {selectedPoint.location_id}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {[selectedPoint.facility, selectedPoint.county, selectedPoint.state]
                        .filter(Boolean)
                        .join(" | ") || "--"}
                    </p>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-md border border-slate-800">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-950 text-left text-slate-400">
                        <tr>
                          <th className="px-2 py-1.5">Role ID</th>
                          <th className="px-2 py-1.5">Role</th>
                          <th className="px-2 py-1.5 text-right">Sign</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRoles.map((role) => (
                          <tr key={role.location_role_id} className="border-t border-slate-800">
                            <td className="px-2 py-1.5 font-mono text-slate-100">
                              {role.location_role_id}
                            </td>
                            <td className="px-2 py-1.5 text-slate-300">
                              {role.role || role.role_code || "--"}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-slate-300">
                              {role.sign == null ? "--" : role.sign}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePoint(selectedPoint)}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    {selectedPointKeys.has(mapFeatureKey(selectedPoint)) ? "Remove Point" : "Add Point"}
                  </button>
                </div>
              )}
            </PanelSection>
          </div>
        </aside>

        <div className="relative min-h-[560px] flex-1">
          <div ref={mapContainerRef} className="absolute inset-0" />
          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
            <div className="rounded-md border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-300 shadow-lg backdrop-blur">
              {formatInt(allPoints.length)} visible points
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-300 shadow-lg backdrop-blur">
              {formatInt(selectedRoleIds.length)} selected roles
            </div>
          </div>
        </div>
      </div>

      <GasNomsImportDialog
        open={importDialogOpen}
        title="Import RT Selection"
        allowApplyToReport
        saving={loading.import || loading.save}
        onClose={() => setImportDialogOpen(false)}
        onSaveWatchlist={saveImportAsWatchlist}
        onApplyToReport={applyImport}
      />
    </div>
  );
}
