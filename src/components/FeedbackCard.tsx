import { cn } from "@/lib/utils";

export type FeedbackType = "positive" | "negative" | "neutral";

interface FeedbackCardProps {
  message: string;
  type: FeedbackType;
}

const FeedbackCard = ({ message, type }: FeedbackCardProps) => {
  return (
    <div
      className={cn(
        "glass-card rounded-2xl px-6 py-4 transition-all duration-300 border",
        type === "positive" && "glow-positive",
        type === "negative" && "glow-negative",
        type === "neutral" && "border-border"
      )}
    >
      <p
        className={cn(
          "text-base font-medium font-heading text-center",
          type === "positive" && "text-positive",
          type === "negative" && "text-negative",
          type === "neutral" && "text-muted-foreground"
        )}
      >
        {message}
      </p>
    </div>
  );
};

export default FeedbackCard;
