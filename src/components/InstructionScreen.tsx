import { ArrowLeft, ArrowRight, Eye } from "lucide-react";
import BicepCurlAnimation from "@/components/BicepCurlAnimation";
import { Badge } from "@/components/ui/badge";

interface InstructionScreenProps {
  exerciseName: string;
  onNext: () => void;
  onBack: () => void;
}

const InstructionScreen = ({ exerciseName, onNext, onBack }: InstructionScreenProps) => {
  return (
    <div className="min-h-dvh w-screen bg-background flex flex-col items-center px-4 py-6">
      {/* Top bar */}
      <div className="w-full flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="glass-card rounded-xl p-2 transition-colors hover:bg-secondary/60"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h2 className="font-heading text-lg font-bold text-foreground tracking-tight">
          {exerciseName} — Form Guide
        </h2>
        <div className="w-9" />
      </div>

      {/* Animation area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full max-w-sm">
        <div className="glass-card rounded-2xl p-6 w-full flex flex-col items-center gap-5">
          <BicepCurlAnimation />

          {/* Labels */}
          <div className="flex flex-wrap justify-center gap-2">
            <Badge variant="secondary" className="gap-1.5 text-xs font-medium px-3 py-1.5">
              <Eye className="h-3 w-3 text-primary" />
              Stand side-on
            </Badge>
            <Badge variant="secondary" className="gap-1.5 text-xs font-medium px-3 py-1.5">
              Keep elbow tucked
            </Badge>
            <Badge variant="secondary" className="gap-1.5 text-xs font-medium px-3 py-1.5">
              Keep shoulders down
            </Badge>
          </div>
        </div>

        {/* Tip */}
        <p className="text-muted-foreground text-sm text-center leading-relaxed max-w-xs">
          Position yourself <span className="text-primary font-medium">side-on</span> to the camera so your arm is clearly visible throughout the movement.
        </p>
      </div>

      {/* Next button */}
      <div className="w-full max-w-sm mt-6">
        <button
          onClick={onNext}
          className="w-full rounded-xl bg-primary py-3.5 text-base font-heading font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          Start Workout
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default InstructionScreen;
