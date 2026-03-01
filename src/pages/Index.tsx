// @refresh reset
// Force full remount after hook structure change — v5
import { useRef, useState } from "react";
import { ArrowLeft, Check, Dumbbell, X } from "lucide-react";
import ExerciseSelection, { type Exercise } from "@/components/ExerciseSelection";
import RepCounter from "@/components/RepCounter";
import FeedbackCard from "@/components/FeedbackCard";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

const Index = () => {
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { reps, feedback, feedbackType, invalidRep, validRep, calibrationCountdown } = usePoseDetection(
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

      {/* Calibration countdown */}
      {calibrationCountdown !== null && (
        <div className="relative z-10 mt-6 flex flex-col items-center gap-2">
          <div className="glass-card rounded-2xl px-6 py-4 flex flex-col items-center gap-1 animate-in fade-in duration-300">
            <span className="text-4xl font-bold text-primary font-heading">{calibrationCountdown}</span>
            <span className="text-xs text-muted-foreground font-medium">Hold still...</span>
          </div>
        </div>
      )}

      {/* Rep counter with invalid rep indicator */}
      <div className="relative z-10 mt-6 flex flex-col items-center gap-2">
        <RepCounter count={reps} exercise={selectedExercise.repLabel} />
        {invalidRep && (
          <div className="animate-in fade-in zoom-in-95 duration-200 flex items-center gap-1.5">
            <Badge variant="destructive" className="text-xs font-semibold px-3 py-1 gap-1">
              <X className="h-3 w-3" />
              Not Counted
            </Badge>
          </div>
        )}
        {validRep && !invalidRep && (
          <div className="animate-in fade-in zoom-in-95 duration-200 flex items-center gap-1.5">
            <Badge className="text-xs font-semibold px-3 py-1 gap-1 border-transparent bg-positive/20 text-positive">
              <Check className="h-3 w-3" />
              Counted
            </Badge>
          </div>
        )}
      </div>

      {/* Calibration countdown */}
      {calibrationCountdown !== null && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 pointer-events-none">
          <div className="glass-card rounded-2xl px-8 py-6 flex flex-col items-center gap-3">
            <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">Hold still to calibrate</p>
            <span className="font-heading text-7xl font-bold text-primary tabular-nums">
              {calibrationCountdown}
            </span>
          </div>
        </div>
      )}

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
