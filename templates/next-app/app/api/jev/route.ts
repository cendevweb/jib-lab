import { createSimulatedProvider } from "@jib/jev";
import { createJevRouteHandler, resolveServerProvider } from "@jib/jev/server";

// Live TypeSafe Jev when TYPESAFE_API_KEY is set (and JEV_MODE != "simulated"), else offline simulation.
export const POST = createJevRouteHandler(resolveServerProvider(createSimulatedProvider()));
