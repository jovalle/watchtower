import type { LoaderFunctionArgs } from "@remix-run/node";
import type { LibrarySection } from "~/lib/native/contract";
import { nativePlexClient, plexData } from "~/lib/native/catalog.server";
import { nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const client = nativePlexClient(await requireNativePrincipal(request));
    const items = plexData(await client.getLibraries())
      .filter((section): section is typeof section & { type: "movie" | "show" } => section.type === "movie" || section.type === "show")
      .map((section) => ({ sectionId: section.key, type: section.type, title: section.title }) satisfies LibrarySection);
    return nativeJson({ items }, requestId);
  });
}