import { GET as navPositionsGET } from "../../dev/nav-positions/route";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = "/api/nav-positions";
  if (!url.searchParams.has("mode")) {
    url.searchParams.set("mode", "debug");
  }

  return navPositionsGET(new Request(url.toString(), request));
}
