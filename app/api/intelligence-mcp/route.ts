import { createIntelligenceHandler } from "@/lib/intelligence/handler";

export const runtime = "nodejs";
export const maxDuration = 120;
const handler = createIntelligenceHandler();
export { handler as GET, handler as POST };
