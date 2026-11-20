// Where somebody is, now that Srijan is not six cities.
//
// A state comes from a list, because there are 36 of them and a typo in one would quietly take a
// creator out of every search. A city is typed, because India has tens of thousands of them and no
// list worth shipping or maintaining would hold the one somebody actually lives in.
//
// That leaves coordinates, which matching needs and a typed name does not carry. The browser looks
// the city up before sending it (see `components/CityField.tsx`), so most of the time real
// coordinates arrive with the form. When they do not — the lookup failed, the place is too small
// to be known, somebody posted the form by hand — the middle of the state is used instead and
// `coarse` is set, and `dispatch.ts` then matches by state rather than pretending to a distance it
// does not have.
import { cleanCityName, findState } from "./config";
import { assert } from "./util";

export interface PlaceInput {
  stateId?: string;
  city?: string;
  /** From the browser's lookup of the typed city. Absent is normal, not an error. */
  lat?: number;
  lng?: number;
}

export interface Place {
  stateId: string;
  city: string;
  lat: number;
  lng: number;
  coarse: boolean;
}

/** Mainland and islands, generously. Only to reject nonsense, not to judge a border. */
const INDIA = { minLat: 5, maxLat: 38, minLng: 67, maxLng: 98 };

const inIndia = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= INDIA.minLat && lat <= INDIA.maxLat && lng >= INDIA.minLng && lng <= INDIA.maxLng;

/**
 * Checks a state and a typed city and settles on coordinates for them.
 *
 * Coordinates sent by a browser are never taken on trust beyond "somewhere in India": they decide
 * who gets alerted about a job, so a number from outside the country is thrown away rather than
 * used. Falling back to the state centroid is always safe — it only ever widens the search.
 */
export function resolvePlace(input: PlaceInput): Place {
  const state = findState(input.stateId);
  assert(state, "Pick your state");
  const city = cleanCityName(input.city);
  assert(city.length >= 2, "Enter your city or town");

  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (inIndia(lat, lng)) return { stateId: state.id, city, lat, lng, coarse: false };
  return { stateId: state.id, city, lat: state.lat, lng: state.lng, coarse: true };
}

/** Did this record come from before states, and still need migrating? */
export const needsPlaceMigration = (x: { stateId?: string; cityId?: string }) => !x.stateId && !!x.cityId;
