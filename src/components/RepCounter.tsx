interface RepCounterProps {
  count: number;
  exercise: string;
}

const RepCounter = ({ count, exercise }: RepCounterProps) => {
  return (
    <div className="glass-card rounded-2xl px-5 py-3 flex flex-col items-center min-w-[80px]">
      <span className="text-3xl font-heading font-bold text-foreground tabular-nums">
        {count}
      </span>
      <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {exercise}
      </span>
    </div>
  );
};

export default RepCounter;
