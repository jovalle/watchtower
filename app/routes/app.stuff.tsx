import { Outlet } from "@remix-run/react";
import { Container, PageHeader, SectionNavigation } from "~/components/layout";

export default function MyStuff() {
  return <>
    <Container size="wide" className="pt-8">
      <PageHeader title="My Stuff" navigation={<SectionNavigation label="My Stuff sections" items={[
        { label: "Watchlist", to: "/app/stuff/watchlist" },
        { label: "Lists", to: "/app/stuff/lists" },
      ]} />} />
    </Container>
    <Outlet />
  </>;
}
