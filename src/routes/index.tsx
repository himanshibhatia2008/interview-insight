import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

// InterviewX uses its own hash-based pages (#/dashboard, #/lab, …) inside this one route.
// It is rendered only in the browser: it relies on localStorage, the microphone and pdf.js.
// `import.meta.env.SSR` is replaced at build time, so the server bundle never includes InterviewX.
const InterviewXRoot = import.meta.env.SSR
  ? () => null
  : lazy(() => import("@/interviewx/Root.jsx"));

const TITLE = "InterviewX — AI Interview Preparation for Students";
const DESCRIPTION =
  "Prepare Smarter. Interview Better. Get Hired. AI mock interviews, voice practice, resume analysis, technical quizzes and career roadmaps.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "theme-color", content: "#070a1a" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
  component: Index,
});

function Splash() {
  return (
    <div
      role="status"
      aria-label="Loading InterviewX"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.25), transparent 60%), #070a1a",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 35% 30%, #fff 0, #8fd3ff 18%, #8b5cf6 60%, #1d1a6e 100%)",
          boxShadow: "0 0 60px rgba(139,92,246,0.6)",
        }}
      />
    </div>
  );
}

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Splash />;
  return (
    <Suspense fallback={<Splash />}>
      <InterviewXRoot />
    </Suspense>
  );
}
