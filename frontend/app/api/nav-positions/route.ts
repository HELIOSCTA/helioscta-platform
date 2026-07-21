import { GET as navPositionsGET } from "../dev/nav-positions/route";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  return navPositionsGET(request);
}
