/** Cities offered as the second city of a comparison, in order of preference. */
const SUGGESTED_CITIES = ["London", "New York", "Chicago", "Los Angeles", "Berlin", "Tokyo"] as const;

const key = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** True when `a` names the same place as `b` ("Chicago" and "Chicago, IL"). */
export const isSameCity = (a: string, b: string): boolean => {
  const [x, y] = [key(a), key(b)];
  return x !== "" && y !== "" && (x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `));
};

/** A city worth comparing with: never the brief's own. */
export const suggestSecondCity = (briefCity: string): string => SUGGESTED_CITIES.find((c) => !isSameCity(c, briefCity)) ?? "London";
