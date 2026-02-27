import { useRef } from "react";
import RepCounter from "@/components/RepCounter";
import FeedbackCard from "@/components/FeedbackCard";
import { usePoseDetection } from "@/hooks/usePoseDetection";

const Index = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { repCount, feedback, isLoading } = usePoseDetection(videoRef, canvasRef);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-background">
      {/* Video feed */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover -scale-x-100"
        playsInline
        muted
      />

      {/* Pose skeleton overlay */}
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="absolute inset-0 h-full w-full object-cover -scale-x-100"
      />

      {/* Dark gradient overlay for UI readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-transparent to-background/80 pointer-events-none" />

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/90 z-20">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="font-heading text-lg text-foreground">Starting camera…</p>
          </div>
        </div>
      )}

      {/* Top HUD */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-start justify-between">
        <RepCounter count={repCount} exercise="REPS" />
        <div className="glass-card rounded-2xl px-4 py-2">
          <span className="font-heading text-sm font-semibold text-primary tracking-wide">
            AI TRAINER
          </span>
        </div>
      </div>

      {/* Bottom feedback */}
      <div className="absolute bottom-6 left-4 right-4 z-10">
        <FeedbackCard message={feedback.message} type={feedback.type} />
      </div>
    </div>
  );
};

export default Index;
