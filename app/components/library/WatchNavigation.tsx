import { Container, PageHeader, SectionNavigation } from "~/components/layout";

export default function WatchNavigation() {
  return (
    <Container size="wide" className="pt-8">
      <PageHeader title="Watch" navigation={<SectionNavigation label="Watch sections" items={[
        { label: "Movies", to: "/app/watch/movies" },
        { label: "Series", to: "/app/watch/series" },
        { label: "New in Library", to: "/app/watch/recent" },
      ]} />} />
    </Container>
  );
}
