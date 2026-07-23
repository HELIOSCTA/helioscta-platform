import { GET as clearStreetTradesGET } from "../dev/clear-street-trades/route";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  return clearStreetTradesGET(request);
}
