import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { routeToModel } from "./router.js";

export default definePluginEntry({
  id: "cartha-router",
  name: "Cartha Smart Router",
  description:
    "Routes prompts to the best model for the task — MiMo-V2-Pro default, specialists for code/vision/speed",
  register(api) {
    api.on("before_model_resolve", (event, ctx) => {
      return routeToModel(event.prompt, ctx?.sessionId);
    });
  },
});
