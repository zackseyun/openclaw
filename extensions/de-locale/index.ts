import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

export default definePluginEntry({
  id: "de-locale",
  name: "German Locale Prototype",
  description: "Prototype German locale plugin for docs materialization.",
  register() {
    // Locale resources are consumed by build-time docs sync, not runtime hooks.
  },
});
