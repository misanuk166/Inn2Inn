import { notFound } from "next/navigation";
import { getLodgingById, getPoisByRoute, getRouteById } from "@/lib/db";
import { RouteDetail } from "./RouteDetail";

export default async function RoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const route = await getRouteById(id);
  if (!route) notFound();

  const [hotelA, hotelB, pois] = await Promise.all([
    getLodgingById(route.aId),
    getLodgingById(route.bId),
    getPoisByRoute(route.id),
  ]);
  if (!hotelA || !hotelB) notFound();

  return <RouteDetail route={route} hotelA={hotelA} hotelB={hotelB} pois={pois} />;
}
