import { Dashboard } from "@/components/dashboard";

export default function Home() {
  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(42,171,238,0.16),_transparent_42%),radial-gradient(circle_at_80%_20%,_rgba(99,102,241,0.12),_transparent_32%)]" />
      <div className="relative">
        <Dashboard />
      </div>
    </div>
  );
}
