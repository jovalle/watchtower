import { redirect, type LoaderFunctionArgs } from "@remix-run/node";

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab");
  return redirect(`${tab === "coming" || tab === "worth" ? "/app/discover" : "/app/watch/recent"}${url.search}`);
}
