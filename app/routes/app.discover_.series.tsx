import { redirect, type LoaderFunctionArgs } from "@remix-run/node";

export function loader({ request }: LoaderFunctionArgs) {
  return redirect(`/app/watch/series${new URL(request.url).search}`);
}
