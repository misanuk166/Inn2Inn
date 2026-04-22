# Inn2Inn — Product Specification

## Overview

Inn2Inn is a web application for planning inn-to-inn hiking trips in Marin County, California. The core premise: a hiker should be able to discover which lodging properties in Marin County are walkable between each other via trail, understand how scenic or challenging each route is, and assemble those routes into a multi-day itinerary. The app has three pages — Explorer, Route Detail, and Planner — each building on a shared foundation of lodging data and pre-computed hiking routes.

---

## Data

**Lodging properties.** The app works with approximately 50 real lodging properties in Marin County — inns, cabins, retreats, huts, and bed-and-breakfasts. The developer should source and index these independently using publicly available geographic data. Each property needs a name, lodging type, geographic coordinates, city, street address, and elevation in feet.

**Routes.** A route connects two lodging properties that are within roughly ten miles of each other by trail. Routes are pre-computed, not calculated on demand. Each route carries: distance in miles, estimated walking time, elevation gain in feet, elevation loss in feet, a trail-traced polyline geometry (not a straight line between the two points), a scenic score from 0 to 100, a scenic rating category, and five component sub-scores that make up the scenic score.

**Scenic scoring.** Every route is scored 0–100 across five equally weighted components: how natural the trail corridor is (forest and open space vs. road), the drama of the elevation change, proximity to coast or water, trail surface quality, and whether the hike distance falls in a sweet spot that most hikers find ideal. The sum of those five components maps to one of four categories: Highly Scenic (72 and above), Scenic (52–71), Moderately Scenic (32–51), and Urban/Road (below 32).

---

## Page 1: Explorer

The Explorer is the main discovery interface. It uses a split layout: a sidebar on the left containing filters and a route list, and a full-height interactive map on the right.

### Map

The map displays every lodging property as a marker and every hiking route as a color-coded polyline, where the color reflects that route's scenic rating category. Route geometry follows actual trails — not straight lines. The map offers multiple visual style options (for example, topographic, light, dark, and minimal) so the user can choose whichever background makes the route colors easiest to read.

### Filters

The sidebar contains four filters that narrow what appears in the route list (and optionally what is highlighted on the map):

1. **Hotel search / endpoint filter.** The user can type a hotel name to select it as an endpoint filter. Once selected, only routes that include that hotel are shown. A direction toggle on this filter lets the user specify whether the selected hotel is the departure point or the arrival point. This changes how routes are labeled in the list (affecting which end appears first in the "A → B" name), but does not hide any routes — all routes touching that hotel remain visible regardless of direction.

2. **Scenic rating filter.** The user can filter by rating category: all routes, Highly Scenic only, Scenic and above, Moderately Scenic and above, or Urban/Road only.

3. **Maximum distance slider.** Caps the list to routes at or below the chosen distance in miles.

4. **Maximum elevation gain slider.** Caps the list to routes at or below the chosen gain in feet.

### Route list

Beneath the filters, the sidebar shows the filtered set of routes sorted by scenic score (highest first). Each row displays the route name as "Departure → Destination," the numeric scenic score, the rating badge, the distance, the elevation gain, and the estimated walking time. Clicking any row navigates to that route's detail page.

### Hotel detail panel

Clicking a hotel marker on the map opens a panel — either sliding in from the side or appearing as an overlay — showing: a photo of the property, its name, lodging type, city, address, elevation, price range, a short prose description, its highest-scoring routes listed briefly, and a link to the property's website. The panel includes a button that pins this hotel as the active endpoint filter in the sidebar.

---

## Page 2: Route Detail

The Route Detail page is dedicated to a single route. It is reachable by clicking any route in the Explorer list or from route references elsewhere in the app.

### Direction

A "Reverse" button in the page header lets the user flip the direction of travel. When reversed: the title updates so the two hotels swap positions (B → A instead of A → B), the elevation gain and loss values swap, the elevation profile chart mirrors horizontally, and the start and end markers on the map swap. Routes are inherently bidirectional — either property can serve as the starting point.

### Content

The page presents:

- The route title with the Reverse button
- Key stats: distance, estimated walking time, elevation gain, and elevation loss
- The scenic score (0–100) with each of the five component scores shown as labeled horizontal bars beneath it
- Start and end hotel cards, each showing the property name, city, and elevation
- A map rendering the actual trail polyline with distinct start and end markers
- An elevation profile chart with distance along the horizontal axis and elevation in feet on the vertical axis, derived from the geometry of the route
- Points of interest along the route sourced from publicly available geographic data — specifically restaurants, cafés, viewpoints, named peaks, and other features relevant to hikers — displayed on the map and optionally listed below it

---

## Page 3: Planner

The Planner is a multi-day trip builder. It uses the same split layout as the Explorer: a builder panel on the left, a map on the right.

### Trip builder

The builder panel has an editable trip name at the top, followed by a summary row showing total distance, total elevation gain, total estimated time, and number of days. Below the summary is a list of legs, one per day.

Each leg has a start point and an end point. The end point must always be a lodging property (so the hiker has somewhere to sleep). The start point of each leg after the first is automatically populated with the end hotel of the previous leg — the user does not need to set it manually. For the first leg, or any leg where the user wants to begin somewhere other than a hotel, the user clicks a button to enter "map picking" mode: the cursor becomes a crosshair, a hint overlay appears on the map instructing the user to click their desired start location, and clicking anywhere on the map sets that coordinate as the leg's start point. The app reverse-geocodes that coordinate to produce a human-readable place name.

Once both endpoints are set for a leg, the leg displays route stats: distance, elevation gain, and estimated time. If both endpoints are lodging properties with a pre-computed route between them, that pre-computed route is used. If either endpoint is a custom location, the app computes a walking route on the fly using a routing service and displays the same stats. Custom-segment routes are visually distinguished on the map — for example, rendered as a dashed line rather than a solid one.

Legs can be reordered (moved up or down in the list), deleted individually, and added at the end.

### Map

The map shows all legs simultaneously as polylines, each day rendered in a distinct color. Hotel endpoint markers and custom waypoint markers are also shown. The map auto-fits its viewport to show the full trip whenever the itinerary changes.

### Saved itineraries

Users can save the current trip as a named itinerary, load previously saved itineraries, rename them, and delete them. Saved itineraries persist between sessions. The developer chooses how and where to store them.
