import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyPanel } from "@/components/kb/Bits";

export default function NotFound() {
  return (
    <div className="canvas-grid flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-card">
        <EmptyPanel icon={Compass} title="Page not found" text="That address does not match any DevAtlas page." action={<Link to="/"><Button>Go home</Button></Link>} />
      </div>
    </div>
  );
}
