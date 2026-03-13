/**
 * Auto-registers all background job handlers on import.
 * Import this file in any route that uses enqueueJobs.
 */
import { registerAllJobHandlers } from "./job-handlers";

// Only register once
let initialized = false;
if (!initialized) {
  registerAllJobHandlers();
  initialized = true;
}
