import { createJevRouteHandler, resolveServerProvider } from "@jib/jev/server";
import { createAtcProvider } from "@/jev/resolvers";

// Live TypeSafe Jev when TYPESAFE_API_KEY is set (and JEV_MODE != "simulated"), else the
// scripted ATC simulation (SPEC §5.2).
export const POST = createJevRouteHandler(resolveServerProvider(createAtcProvider()));
