import { handleVerify } from "@/lib/http/verifyRoute";

/** Tells a shared-link page whether its evidence is what this server issued. */
export async function POST(req: Request): Promise<Response> {
  return handleVerify(req);
}
