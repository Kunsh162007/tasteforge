export type QlooErrorKind =
  | "auth"
  | "unsupported_type"
  | "rate_limit"
  | "bad_request"
  | "http"
  | "timeout"
  | "network"
  | "invalid_response";

export class QlooError extends Error {
  readonly kind: QlooErrorKind;
  readonly status?: number;

  constructor(kind: QlooErrorKind, message: string, status?: number) {
    super(message);
    this.name = "QlooError";
    this.kind = kind;
    this.status = status;
  }
}

/** Maps an HTTP failure to a typed error. Messages never include request headers or the key. */
export function errorForStatus(status: number): QlooError {
  switch (status) {
    case 401:
      return new QlooError(
        "auth",
        "Qloo rejected the API key (401). Check QLOO_API_KEY and that QLOO_BASE_URL is https://hackathon.api.qloo.com; hackathon keys fail on staging/production URLs.",
        status,
      );
    case 403:
      return new QlooError(
        "unsupported_type",
        "Qloo returned 403: this entity type is not supported for this key. Use a documented filter.type (e.g. urn:entity:artist, not urn:entity:music).",
        status,
      );
    case 429:
      return new QlooError("rate_limit", "Qloo rate limit hit (429). Slow down or retry shortly.", status);
    case 400:
      return new QlooError(
        "bad_request",
        "Qloo rejected the request (400). Check parameter values such as tag IDs, entity IDs and dates.",
        status,
      );
    default:
      return new QlooError("http", `Qloo request failed with HTTP ${status}.`, status);
  }
}
