import { useRef, useEffect, useCallback } from "react";
import type { FeedbackType } from "@/components/FeedbackCard";

// Number words for rep counts
const NUMBER_WORDS: Record<number, string> = {
  1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five",
  6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten",
  11: "Eleven", 12: "Twelve", 13: "Thirteen", 14: "Fourteen", 15: "Fifteen",
  16: "Sixteen", 17: "Seventeen", 18: "Eighteen", 19: "Nineteen", 20: "Twenty",
};

// Map feedback text to short voice cues
const CORRECTION_CUE_MAP: [RegExp, string][] = [
  [/elbow.*drift|elbows.*pinned/i, "Elbows back"],
  [/elbow.*tucked/i, "Elbow tucked"],
  [/elbow.*forward/i, "Elbows back"],
  [/shoulder|shrug/i, "Shoulders down"],
  [/wrist.*straight|wrist.*curl/i, "Wrist straight"],
];

const RECOVERY_CUE = "Better";
const INVALID_CUE = "Not counted";
const SETUP_CUE = "Start when ready";

const CORRECTION_COOLDOWN_MS = 2500;

export function useVoiceCoach(
  enabled: boolean,
  reps: number,
  invalidRep: boolean,
  feedback: string,
  feedbackType: FeedbackType,
) {
  const prevRepsRef = useRef(reps);
  const prevInvalidRef = useRef(false);
  const prevFeedbackRef = useRef(feedback);
  const lastCorrectionTimeRef = useRef<Record<string, number>>({});
  const hasSpokenSetupRef = useRef(false);
  const speakingRef = useRef(false);

  const speak = useCallback((text: string) => {
    if (!enabled || typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    // Cancel any queued utterances to keep it snappy
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 0.9;
    utterance.volume = 0.85;

    // Try to pick a natural English voice
    const voices = synth.getVoices();
    const preferred = voices.find(
      (v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("samantha"),
    ) ?? voices.find(
      (v) => v.lang.startsWith("en") && !v.name.toLowerCase().includes("novelty"),
    );
    if (preferred) utterance.voice = preferred;

    speakingRef.current = true;
    utterance.onend = () => { speakingRef.current = false; };
    utterance.onerror = () => { speakingRef.current = false; };

    synth.speak(utterance);
  }, [enabled]);

  // Valid rep counted → speak number
  useEffect(() => {
    if (reps > prevRepsRef.current && reps > 0) {
      speak(NUMBER_WORDS[reps] ?? String(reps));
    }
    prevRepsRef.current = reps;
  }, [reps, speak]);

  // Invalid rep → speak "Not counted"
  useEffect(() => {
    if (invalidRep && !prevInvalidRef.current) {
      speak(INVALID_CUE);
    }
    prevInvalidRef.current = invalidRep;
  }, [invalidRep, speak]);

  // Feedback-driven cues: corrections + recovery + setup
  useEffect(() => {
    if (feedback === prevFeedbackRef.current) return;
    prevFeedbackRef.current = feedback;

    const now = Date.now();

    // Setup cue
    if (feedback.toLowerCase().includes("ready") && feedback.toLowerCase().includes("start") && !hasSpokenSetupRef.current) {
      hasSpokenSetupRef.current = true;
      speak(SETUP_CUE);
      return;
    }

    // Correction cues
    if (feedbackType === "correction") {
      for (const [pattern, cue] of CORRECTION_CUE_MAP) {
        if (pattern.test(feedback)) {
          const lastTime = lastCorrectionTimeRef.current[cue] ?? 0;
          if (now - lastTime >= CORRECTION_COOLDOWN_MS) {
            lastCorrectionTimeRef.current[cue] = now;
            speak(cue);
          }
          return;
        }
      }
    }

    // Recovery cue
    if (feedback.toLowerCase().startsWith("better")) {
      const lastTime = lastCorrectionTimeRef.current[RECOVERY_CUE] ?? 0;
      if (now - lastTime >= CORRECTION_COOLDOWN_MS) {
        lastCorrectionTimeRef.current[RECOVERY_CUE] = now;
        speak(RECOVERY_CUE);
      }
    }
  }, [feedback, feedbackType, speak]);

  // Reset setup spoken flag when reps reset (new session)
  useEffect(() => {
    if (reps === 0) {
      hasSpokenSetupRef.current = false;
    }
  }, [reps]);
}
