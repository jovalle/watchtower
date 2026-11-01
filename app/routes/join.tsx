import { useEffect, useState } from "react";
import type {
  HeadersFunction,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { getPlexToken } from "~/lib/auth/session.server";

export const headers: HeadersFunction = () => ({
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "private, no-store",
});

export const meta: MetaFunction = () => [
  { title: "Join Watch Together | Watchtower" },
  { name: "referrer", content: "no-referrer" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  return json(
    { signedIn: Boolean(await getPlexToken(request)) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export default function JoinLanding() {
  const { signedIn } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const invite = fragment.get("i");
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    if (!invite) {
      setError("This invite link is incomplete. Ask the host for a new link.");
      return;
    }
    sessionStorage.setItem("wt:invite", invite);
    const destination = "/app/rooms/join";
    navigate(
      signedIn
        ? destination
        : `/auth/redirect?redirectTo=${encodeURIComponent(destination)}`,
      { replace: true }
    );
  }, [navigate, signedIn]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background-primary p-6 text-foreground-primary">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Joining Watch Together</h1>
        <p className="mt-3 text-foreground-secondary">
          {error ?? "Checking your invitation..."}
        </p>
      </div>
    </main>
  );
}