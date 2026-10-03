// Tests lay out text on the HarfBuzz backend, as production hosts do once
// their fonts are loaded. Runs after happydom.ts: happy-dom's globals do not
// change text-measure's backend choice.
import { useHarfBuzz } from "@codecaine-ai/text-measure/headless";

await useHarfBuzz();
