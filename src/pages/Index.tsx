import { useRef, useState } from "react";
import { ArrowLeft, Dumbbell } from "lucide-react";
import ExerciseSelection, { type Exercise } from "@/components/ExerciseSelection";
import RepCounter from "@/components/RepCounter";
import FeedbackCard from "@/components/FeedbackCard";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { Switch } from "@/components/ui/switch";

const Index = () => {
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { reps, feedback, feedbackType } = usePoseDetection(
    videoRef,
    canvasRef,
    selectedExercise?.id ?? null,
    showOverlay
  );

  const handleBack = () => {
    setSelectedExercise(null);
  };

  if (!selectedExercise) {
    return <ExerciseSelection onSelect={setSelectedExercise} />;
  }

  return (
    <div className="relative min-h-dvh w-screen overflow-hidden bg-background">
      {/* Camera */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover mirror"
        autoPlay
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover mirror" />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-transparent to-background/80" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-6">
        <button
          onClick={handleBack}
          className="glass-card rounded-xl p-2 transition-colors hover:bg-secondary/60"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>

        <div className="flex items-center gap-2">
          <Dumbbell className="h-5 w-5 text-primary" />
          <h1 className="font-heading text-lg font-bold text-foreground tracking-tight">
            {selectedExercise.name}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="debug-overlay" className="text-xs text-muted-foreground font-medium">
            Debug
          </label>
          <Switch
            id="debug-overlay"
            checked={showOverlay}
            onCheckedChange={setShowOverlay}
            className="scale-75"
          />
        </div>
      </div>

      {/* Rep counter */}
      <div className="relative z-10 mt-6 flex justify-center">
        <RepCounter count={reps} exercise={selectedExercise.repLabel} />
      </div>

      {/* Feedback */}
      <div className="absolute bottom-8 left-4 right-4 z-10 flex justify-center">
        <div className="w-full max-w-sm">
          <FeedbackCard message={feedback} type={feedbackType} />
        </div>
      </div>
    </div>
  );
};

export default Index;
