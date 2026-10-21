import type { JsonRequest } from "./types";

/** The chain a request is routed to: explicit route, else "fast" for the light tier. */
export const routeOf = (req: JsonRequest): "fast" | "main" => req.route ?? (req.tier === "light" ? "fast" : "main");
