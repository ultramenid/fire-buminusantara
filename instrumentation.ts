import type { Instrumentation } from "next";
import { catatGalat } from "./lib/catat-galat";

/** Galat yang lolos ke Next (render, route, action yang melempar) ikut ke
 *  log + webhook yang sama dengan galat yang ditangkap di lib/. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  await catatGalat(`${context.routeType} ${context.routePath}`, err, `${request.method} ${request.path}`);
};
