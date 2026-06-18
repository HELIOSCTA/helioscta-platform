import "server-only";

function isVercelDeployment(): boolean {
  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV) ||
    Boolean(process.env.VERCEL_URL)
  );
}

export function isLocalOnlyFeatureEnabled(): boolean {
  return !isVercelDeployment();
}

export function isDurationCurvesDevEnabled(): boolean {
  return isLocalOnlyFeatureEnabled();
}

export function isWeatherDevEnabled(): boolean {
  return isLocalOnlyFeatureEnabled();
}
