import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  NativeError,
  withNativeErrors,
} from "~/lib/native/http.server";

async function notFound({ request }: LoaderFunctionArgs | ActionFunctionArgs) {
  return withNativeErrors(request, async () => {
    throw new NativeError(404, "not_found", "Native API endpoint not found.");
  });
}

export const loader = notFound;
export const action = notFound;