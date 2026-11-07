import { useState } from "react";
import { Link, useRevalidator } from "@remix-run/react";
import { Container } from "~/components/layout";
import { Button, buttonStyles } from "~/components/ui";
import { RequestModal } from "./RequestModal";

export interface ExternalTitleData {
  title: string;
  overview?: string;
  posterPath?: string | null;
  year: string;
  type: "movie" | "show";
  id: number | null;
  imdbId?: string;
  requests?: Array<{ id: number; is4k: boolean; state: string }>;
  status: number | null;
  status4k: number | null;
  requestEnabled: boolean;
  error: string | null;
}
const statuses: Record<number, string> = { 1: "Not requested", 2: "Awaiting approval", 3: "Processing", 4: "Partially available", 5: "Available in Seerr", 6: "Blocked", 7: "Deleted" };

export function ExternalTitle({ data }: { data: ExternalTitleData }) {
  const [requesting, setRequesting] = useState(false);
  const revalidator = useRevalidator();
  const posterUrl = data.posterPath ? `https://image.tmdb.org/t/p/w500${data.posterPath}` : null;
  return (
    <Container size="wide" className="py-10">
      <div className="flex flex-col gap-8 sm:flex-row">
        {posterUrl && <img src={posterUrl} alt="" className="aspect-[2/3] w-40 self-start rounded-lg object-cover sm:w-64" />}
        <div className="min-w-0 max-w-2xl space-y-5 break-words">
          <p className="text-foreground-secondary">{data.year} · {data.type === "show" ? "Series" : "Movie"}</p>
          <h1 className="text-3xl font-bold sm:text-5xl">{data.title}</h1>
          {data.overview && <p className="text-lg text-foreground-secondary">{data.overview}</p>}
          <p>{data.status === null ? "Request status unavailable" : statuses[data.status] || "Unknown status"}{data.status4k !== null && data.status4k > 1 ? ` · 4K: ${statuses[data.status4k] || "Unknown"}` : ""}</p>
          {(data.status === 4 || data.status === 5) && <p className="text-foreground-secondary">No matching title is accessible in your Plex library yet. Refresh after it has been imported, or check library access with your administrator.</p>}
          {data.requests?.map((request) => <p key={request.id}>Your {request.is4k ? "4K " : ""}request: {request.state}</p>)}
          {data.error && <p role="alert" className="text-red-400">{data.error}</p>}
          <div role="group" aria-label="Media Actions" className="flex flex-col flex-wrap gap-3 sm:flex-row">
            {data.requestEnabled && <Button size="lg" onClick={() => setRequesting(true)}>{data.status === 1 || data.status === 7 ? "Request" : "Requests & Availability"}</Button>}
            <Button variant="secondary" size="lg" disabled={revalidator.state !== "idle"} onClick={() => revalidator.revalidate()}>Refresh Availability</Button>
            <Link to="/app/requests" className={buttonStyles({ variant: "secondary", size: "lg" })}>Your Requests</Link>
          </div>
        </div>
      </div>
      {requesting && data.id && <RequestModal item={{ tmdbId: data.id, type: data.type, title: data.title, year: data.year, posterUrl, tmdbUrl: `https://www.themoviedb.org/${data.type === "show" ? "tv" : "movie"}/${data.id}` }} onClose={() => { setRequesting(false); revalidator.revalidate(); }} />}
    </Container>
  );
}
