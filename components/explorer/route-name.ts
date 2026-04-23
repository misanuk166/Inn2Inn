import type { Lodging, Route } from "@/lib/types";

export interface RouteEndpoints {
  fromName: string;
  toName: string;
  fromId: string;
  toId: string;
}

// Returns the route's "Departure → Destination" labels, respecting the
// endpointHotelId/direction filter so the user-pinned hotel appears on the
// correct side of the arrow.
export function routeEndpoints(
  route: Route,
  lodgingById: Map<string, Lodging>,
  endpointHotelId: string | null,
  direction: "depart" | "arrive"
): RouteEndpoints {
  let fromId = route.aId;
  let toId = route.bId;

  if (endpointHotelId) {
    if (route.aId === endpointHotelId && direction === "arrive") {
      fromId = route.bId;
      toId = route.aId;
    } else if (route.bId === endpointHotelId && direction === "depart") {
      fromId = route.bId;
      toId = route.aId;
    }
  }

  return {
    fromId,
    toId,
    fromName: lodgingById.get(fromId)?.name ?? "Unknown",
    toName: lodgingById.get(toId)?.name ?? "Unknown",
  };
}
