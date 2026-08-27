/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as agentData from "../agentData.js";
import type * as agents_fieldPilot from "../agents/fieldPilot.js";
import type * as agents_provider from "../agents/provider.js";
import type * as agents_tools_reads from "../agents/tools/reads.js";
import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as authEmail from "../authEmail.js";
import type * as chat from "../chat.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as lib_authUser from "../lib/authUser.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_demoProject from "../lib/demoProject.js";
import type * as lib_markup from "../lib/markup.js";
import type * as lib_photoExif from "../lib/photoExif.js";
import type * as lib_photoExifFallback from "../lib/photoExifFallback.js";
import type * as lib_quantityReport from "../lib/quantityReport.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_taskActivity from "../lib/taskActivity.js";
import type * as lib_taskAttributes from "../lib/taskAttributes.js";
import type * as lib_tmpAccountDevFeature from "../lib/tmpAccountDevFeature.js";
import type * as lib_uploads from "../lib/uploads.js";
import type * as markups from "../markups.js";
import type * as notes from "../notes.js";
import type * as photoUploadDiagnostics from "../photoUploadDiagnostics.js";
import type * as photoUploadHttp from "../photoUploadHttp.js";
import type * as photoUploads from "../photoUploads.js";
import type * as projects from "../projects.js";
import type * as quantities from "../quantities.js";
import type * as sheets from "../sheets.js";
import type * as taskAttributes from "../taskAttributes.js";
import type * as tasks from "../tasks.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  agentData: typeof agentData;
  "agents/fieldPilot": typeof agents_fieldPilot;
  "agents/provider": typeof agents_provider;
  "agents/tools/reads": typeof agents_tools_reads;
  attachments: typeof attachments;
  auth: typeof auth;
  authEmail: typeof authEmail;
  chat: typeof chat;
  http: typeof http;
  invitations: typeof invitations;
  "lib/authUser": typeof lib_authUser;
  "lib/authz": typeof lib_authz;
  "lib/demoProject": typeof lib_demoProject;
  "lib/markup": typeof lib_markup;
  "lib/photoExif": typeof lib_photoExif;
  "lib/photoExifFallback": typeof lib_photoExifFallback;
  "lib/quantityReport": typeof lib_quantityReport;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/taskActivity": typeof lib_taskActivity;
  "lib/taskAttributes": typeof lib_taskAttributes;
  "lib/tmpAccountDevFeature": typeof lib_tmpAccountDevFeature;
  "lib/uploads": typeof lib_uploads;
  markups: typeof markups;
  notes: typeof notes;
  photoUploadDiagnostics: typeof photoUploadDiagnostics;
  photoUploadHttp: typeof photoUploadHttp;
  photoUploads: typeof photoUploads;
  projects: typeof projects;
  quantities: typeof quantities;
  sheets: typeof sheets;
  taskAttributes: typeof taskAttributes;
  tasks: typeof tasks;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
