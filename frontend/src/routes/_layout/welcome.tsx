import { createFileRoute } from "@tanstack/react-router";

import { WelcomeScreen } from "@/components/WelcomeScreen";

interface WelcomeSearch {
  collection?: string;
}

export const Route = createFileRoute("/_layout/welcome")({
  component: WelcomeRoute,
  validateSearch: (search: Record<string, unknown>): WelcomeSearch => ({
    collection:
      typeof search.collection === "string" && search.collection.length > 0
        ? search.collection
        : undefined,
  }),
});

function WelcomeRoute() {
  const { collection } = Route.useSearch();
  return <WelcomeScreen targetCollectionId={collection ?? null} />;
}
