import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { sanitizeUserCode } from "~/lib/native/link.server";

export function loader({ request }: LoaderFunctionArgs) {
  const code = sanitizeUserCode(new URL(request.url).searchParams.get("code"));
  throw redirect(code ? `/app/link?code=${code}` : "/app/link");
}