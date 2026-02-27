import { Dumbbell, Lock } from "lucide-react";
import bicepCurlImg from "@/assets/bicep-curl.png";
import squatImg from "@/assets/squat.png";
import pushupImg from "@/assets/pushup.png";
import shoulderPressImg from "@/assets/shoulder-press.png";

export interface Exercise {
  id: string;
  name: string;
  repLabel: string;
  image: string;
  available: boolean;
}

const exercises: Exercise[] = [
  { id: "bicep-curl", name: "Bicep Curl", repLabel: "CURLS", image: bicepCurlImg, available: true },
  { id: "squat", name: "Squat", repLabel: "SQUATS", image: squatImg, available: false },
  { id: "pushup", name: "Push Up", repLabel: "REPS", image: pushupImg, available: false },
  { id: "shoulder-press", name: "Shoulder Press", repLabel: "PRESSES", image: shoulderPressImg, available: false },
];

interface ExerciseSelectionProps {
  onSelect: (exercise: Exercise) => void;
}

const ExerciseSelection = ({ onSelect }: ExerciseSelectionProps) => {
  return (
    <div className="min-h-dvh w-screen bg-background px-4 py-8 flex flex-col items-center">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Dumbbell className="h-8 w-8 text-primary" />
        <h1 className="font-heading text-3xl font-bold text-foreground tracking-tight">
          AI Trainer
        </h1>
      </div>
      <p className="text-muted-foreground text-sm mb-8">Choose your exercise</p>

      {/* Exercise Grid */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-md">
        {exercises.map((exercise) => (
          <div
            key={exercise.id}
            className={`glass-card rounded-2xl overflow-hidden flex flex-col transition-all duration-200 ${
              exercise.available
                ? "hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10 cursor-pointer"
                : "opacity-50 cursor-not-allowed"
            }`}
          >
            {/* Image */}
            <div className="relative aspect-square w-full overflow-hidden bg-secondary/30">
              <img
                src={exercise.image}
                alt={exercise.name}
                className="w-full h-full object-cover"
              />
              {!exercise.available && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Lock className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="p-3 flex flex-col gap-2">
              <span className="font-heading text-sm font-semibold text-foreground">
                {exercise.name}
              </span>
              {exercise.available ? (
                <button
                  onClick={() => onSelect(exercise)}
                  className="w-full rounded-xl bg-primary py-2 text-sm font-heading font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
                >
                  Start
                </button>
              ) : (
                <span className="text-xs text-muted-foreground text-center py-2">
                  Coming Soon
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExerciseSelection;
