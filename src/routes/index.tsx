import { createFileRoute } from "@tanstack/react-router";
import { RevenueDashboard } from "@/components/revenue-dashboard";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Northline — Revenue" },
      {
        name: "description",
        content: "Offline revenue dashboard with date filters, growth, churn, and plan breakdown.",
      },
    ],
  }),
});

function Home() {
  return <RevenueDashboard />;
}
