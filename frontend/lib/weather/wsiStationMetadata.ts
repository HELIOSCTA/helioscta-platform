export interface WsiStationMetadata {
  stationId: string;
  stationName: string;
  latitude: number | null;
  longitude: number | null;
  timeZone: "America/New_York" | "America/Chicago";
  state: string | null;
}

export const WSI_STATION_METADATA: WsiStationMetadata[] = [
  { stationId: "PJM", stationName: "PJM", latitude: null, longitude: null, timeZone: "America/New_York", state: null },
  { stationId: "KABE", stationName: "Allentown", latitude: 40.6521, longitude: -75.4408, timeZone: "America/New_York", state: "PA" },
  { stationId: "KACY", stationName: "Atlantic City", latitude: 39.4576, longitude: -74.5772, timeZone: "America/New_York", state: "NJ" },
  { stationId: "KBWI", stationName: "Baltimore", latitude: 39.1754, longitude: -76.6684, timeZone: "America/New_York", state: "MD" },
  { stationId: "KCAK", stationName: "Akron-Canton", latitude: 40.9161, longitude: -81.4422, timeZone: "America/New_York", state: "OH" },
  { stationId: "KCRW", stationName: "Charleston", latitude: 38.3731, longitude: -81.5932, timeZone: "America/New_York", state: "WV" },
  { stationId: "KMDW", stationName: "Chicago Midway", latitude: 41.7868, longitude: -87.7522, timeZone: "America/Chicago", state: "IL" },
  { stationId: "KORD", stationName: "Chicago O'Hare", latitude: 41.9742, longitude: -87.9073, timeZone: "America/Chicago", state: "IL" },
  { stationId: "KLUK", stationName: "Cincinnati", latitude: 39.1033, longitude: -84.4186, timeZone: "America/New_York", state: "OH" },
  { stationId: "KCLE", stationName: "Cleveland", latitude: 41.4117, longitude: -81.8498, timeZone: "America/New_York", state: "OH" },
  { stationId: "KCMH", stationName: "Columbus", latitude: 39.998, longitude: -82.8919, timeZone: "America/New_York", state: "OH" },
  { stationId: "KCVG", stationName: "Covington", latitude: 39.0488, longitude: -84.6678, timeZone: "America/New_York", state: "KY" },
  { stationId: "KDAY", stationName: "Dayton", latitude: 39.9024, longitude: -84.2194, timeZone: "America/New_York", state: "OH" },
  { stationId: "KFWA", stationName: "Fort Wayne", latitude: 40.9785, longitude: -85.1951, timeZone: "America/New_York", state: "IN" },
  { stationId: "KHGR", stationName: "Hagerstown", latitude: 39.7086, longitude: -77.7265, timeZone: "America/New_York", state: "MD" },
  { stationId: "KMDT", stationName: "Harrisburg", latitude: 40.1935, longitude: -76.7634, timeZone: "America/New_York", state: "PA" },
  { stationId: "KHTS", stationName: "Huntington", latitude: 38.3667, longitude: -82.558, timeZone: "America/New_York", state: "WV" },
  { stationId: "KMGW", stationName: "Morgantown", latitude: 39.6429, longitude: -79.9163, timeZone: "America/New_York", state: "WV" },
  { stationId: "KEWR", stationName: "Newark", latitude: 40.6895, longitude: -74.1745, timeZone: "America/New_York", state: "NJ" },
  { stationId: "KORF", stationName: "Norfolk", latitude: 36.8946, longitude: -76.2012, timeZone: "America/New_York", state: "VA" },
  { stationId: "KPKB", stationName: "Parkersburg", latitude: 39.3451, longitude: -81.4392, timeZone: "America/New_York", state: "WV" },
  { stationId: "KPHL", stationName: "Philadelphia", latitude: 39.8729, longitude: -75.2437, timeZone: "America/New_York", state: "PA" },
  { stationId: "KPIT", stationName: "Pittsburgh", latitude: 40.4915, longitude: -80.2329, timeZone: "America/New_York", state: "PA" },
  { stationId: "KRIC", stationName: "Richmond", latitude: 37.5052, longitude: -77.3197, timeZone: "America/New_York", state: "VA" },
  { stationId: "KROA", stationName: "Roanoke", latitude: 37.3255, longitude: -79.9754, timeZone: "America/New_York", state: "VA" },
  { stationId: "KRFD", stationName: "Rockford", latitude: 42.1954, longitude: -89.0972, timeZone: "America/Chicago", state: "IL" },
  { stationId: "KAVP", stationName: "Scranton", latitude: 41.3385, longitude: -75.7234, timeZone: "America/New_York", state: "PA" },
  { stationId: "KTOL", stationName: "Toledo", latitude: 41.5868, longitude: -83.8078, timeZone: "America/New_York", state: "OH" },
  { stationId: "KDCA", stationName: "Washington", latitude: 38.8512, longitude: -77.0402, timeZone: "America/New_York", state: "DC" },
  { stationId: "KIAD", stationName: "Washington Dulles", latitude: 38.9531, longitude: -77.4565, timeZone: "America/New_York", state: "VA" },
  { stationId: "KIPT", stationName: "Williamsport", latitude: 41.2418, longitude: -76.9211, timeZone: "America/New_York", state: "PA" },
  { stationId: "KILG", stationName: "Wilmington", latitude: 39.6787, longitude: -75.6065, timeZone: "America/New_York", state: "DE" },
  { stationId: "KDOV", stationName: "Dover", latitude: 39.1295, longitude: -75.466, timeZone: "America/New_York", state: "DE" },
  { stationId: "KWAL", stationName: "Wallops Island", latitude: 37.9402, longitude: -75.4664, timeZone: "America/New_York", state: "VA" },
];

export const WSI_STATION_METADATA_BY_ID = new Map(
  WSI_STATION_METADATA.map((station) => [station.stationId, station])
);
