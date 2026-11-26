import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import SearchPage from "@/pages/Search";
import ServiceMap from "@/pages/ServiceMap";
import CoveragePage from "@/pages/Coverage";
import Ingest from "@/pages/Ingest";
import Feedback from "@/pages/Feedback";
import Team from "@/pages/Team";
import ProjectHub from "@/pages/ProjectHub";
import Article from "@/pages/Article";
import Standards from "@/pages/Standards";
import Glossary from "@/pages/Glossary";
import LearningPath from "@/pages/LearningPath";
import Authoring from "@/pages/Authoring";
import Validation from "@/pages/Validation";
import Translations from "@/pages/Translations";
import Deployments from "@/pages/Deployments";
import DataContracts from "@/pages/DataContracts";
import Snippets from "@/pages/Snippets";
import Architecture from "@/pages/Architecture";
import NotFound from "@/pages/NotFound";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  // While the session resolves render an empty shell, never a flash of the login screen.
  if (loading) return <div className="min-h-screen bg-background" aria-busy="true" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background" aria-busy="true" />;
  return <Navigate to={user ? "/dashboard" : "/login"} replace />;
}

const PROTECTED: [string, ReactNode][] = [
  ["/dashboard", <Dashboard />],
  ["/search", <SearchPage />],
  ["/service-map", <ServiceMap />],
  ["/coverage", <CoveragePage />],
  ["/ingest", <Ingest />],
  ["/feedback", <Feedback />],
  ["/team", <Team />],
  ["/projects/:slug", <ProjectHub />],
  ["/article/:slug", <Article />],
  ["/standards", <Standards />],
  ["/glossary", <Glossary />],
  ["/learning-path", <LearningPath />],
  ["/authoring", <Authoring />],
  ["/validation", <Validation />],
  ["/translations", <Translations />],
  ["/deployments", <Deployments />],
  ["/contracts", <DataContracts />],
  ["/snippets", <Snippets />],
  ["/architecture", <Architecture />],
];

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Landing />} />
      {PROTECTED.map(([path, el]) => (
        <Route key={path} path={path} element={<RequireAuth>{el}</RequireAuth>} />
      ))}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
