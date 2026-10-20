import { getSharedGeocoder, type ReverseGeocoder } from "./nominatim";

/**
 * The reverse geocoder for the current environment: none in mock mode (fixtures already carry area names, and
 * demos must not call out), the shared rate-limited Nominatim client otherwise.
 */
export function getGeocoder(env: Readonly<Record<string, string | undefined>> = process.env): ReverseGeocoder | undefined {
  return (env.QLOO_MODE ?? "mock") === "mock" ? undefined : getSharedGeocoder();
}
