import { useRef, useEffect, useState, useCallback } from "react";
import type { FeedbackType } from "@/components/FeedbackCard";

interface PoseDetectionResult {
  reps: number;
  feedback: string;
  feedbackType: FeedbackType;
  isDetecting: boolean;
  invalidRep: boolean;
  validRep: boolean;
}

function angleBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (magAB === 0 || magCB === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

export function usePoseDetection(
  videoRef: React.RefObject<HTMLVideoElement>,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  selectedExerciseId: string | null,
  showOverlay: boolean = true
): PoseDetectionResult {
  const [reps, setReps] = useState(0);
  const [feedback, setFeedback] = useState("Position yourself in frame");
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("neutral");
  const [isDetecting, setIsDetecting] = useState(false);
  const [invalidRep, setInvalidRep] = useState(false);
  const [validRep, setValidRep] = useState(false);

  const phaseRef = useRef<"up" | "down">("down");
  const animFrameRef = useRef<number | null>(null);
  const poseRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const lastFeedbackTimeRef = useRef<number>(0);
  const baselineElbowXRef = useRef<number | null>(null);
  const baselineElbowShoulderDxRef = useRef<number | null>(null);
  const baselineShoulderYRef = useRef<number | null>(null);
  const hasCountedFirstRepRef = useRef(false);
  const hasCurlStartedRef = useRef(false);
  const showOverlayRef = useRef(showOverlay);
  const formViolationRef = useRef(false);
  const lastViolationTypeRef = useRef<"elbowDrift" | "elbowFlare" | "shoulderShrug" | null>(null);
  const repHadViolationRef = useRef(false);

  const resetState = useCallback(() => {
    setReps(0);
    setFeedback("Stand slightly side-on and keep your lifting arm clearly visible to begin");
    setFeedbackType("neutral");
    setIsDetecting(false);
    setInvalidRep(false);
    setValidRep(false);
    phaseRef.current = "down";
    lastFeedbackTimeRef.current = 0;
    baselineElbowXRef.current = null;
    baselineElbowShoulderDxRef.current = null;
    baselineShoulderYRef.current = null;
    hasCountedFirstRepRef.current = false;
    hasCurlStartedRef.current = false;
    formViolationRef.current = false;
    lastViolationTypeRef.current = null;
    repHadViolationRef.current = false;
  }, []);

  // Keep showOverlayRef in sync without re-running the effect
  useEffect(() => {
    showOverlayRef.current = showOverlay;
  }, [showOverlay]);

  useEffect(() => {
    if (!selectedExerciseId) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      if (poseRef.current) {
        poseRef.current.close();
        poseRef.current = null;
      }
      resetState();
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let cancelled = false;

    const loadPose = async () => {
      // Use CDN globals (loaded via script tags in index.html)
      const PoseClass = (window as any).Pose;
      const poseConnections = (window as any).POSE_CONNECTIONS;
      const CameraClass = (window as any).Camera;
      const drawConnectorsFunc = (window as any).drawConnectors;
      const drawLandmarksFunc = (window as any).drawLandmarks;

      if (!PoseClass || !CameraClass) {
        console.error("MediaPipe not loaded from CDN");
        return;
      }

      if (cancelled) return;

      const pose = new PoseClass({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      pose.onResults((results: any) => {
        if (cancelled) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.poseLandmarks) {
          // Only draw overlay when enabled
          if (showOverlayRef.current) {
            drawConnectorsFunc(ctx, results.poseLandmarks, poseConnections, {
              color: "rgba(0, 255, 128, 0.4)",
              lineWidth: 2,
            });
            drawLandmarksFunc(ctx, results.poseLandmarks, {
              color: "rgba(0, 255, 128, 0.8)",
              lineWidth: 1,
              radius: 3,
            });
          }

          const lm = results.poseLandmarks;

          // Pick primary arm by average visibility
          const leftVis = ((lm[11].visibility ?? 0) + (lm[13].visibility ?? 0) + (lm[15].visibility ?? 0)) / 3;
          const rightVis = ((lm[12].visibility ?? 0) + (lm[14].visibility ?? 0) + (lm[16].visibility ?? 0)) / 3;
          const isLeft = leftVis >= rightVis;

          const shoulder = isLeft ? lm[11] : lm[12];
          const elbow = isLeft ? lm[13] : lm[14];
          const wrist = isLeft ? lm[15] : lm[16];
          const hip = isLeft ? lm[23] : lm[24];

          // Confidence check
          const minVis = Math.min(
            shoulder.visibility ?? 0,
            elbow.visibility ?? 0,
            wrist.visibility ?? 0,
            hip.visibility ?? 0
          );

          if (minVis <= 0.5) {
            const now = Date.now();
            if (now - lastFeedbackTimeRef.current >= 1500) {
              setFeedback("Make sure your side profile and lifting arm are clearly visible");
              setFeedbackType("neutral");
              lastFeedbackTimeRef.current = now;
            }
            setIsDetecting(false);
            return;
          }

          const angle = angleBetween(shoulder, elbow, wrist);

          // Track when user has meaningfully started curling
          if (!hasCurlStartedRef.current && angle < 140) {
            hasCurlStartedRef.current = true;
          }

          // Form violation checks — baseline-relative
          const baselineDx = baselineElbowShoulderDxRef.current;
          const currentDx = Math.abs(elbow.x - shoulder.x);
          const hasElbowDrift = baselineDx !== null && (currentDx - baselineDx) > 0.05;

          const elbowFlare = Math.abs(elbow.x - shoulder.x);
          const hasElbowFlare = elbowFlare > 0.08;

          const hasShoulderShrug = baselineShoulderYRef.current !== null
            ? (baselineShoulderYRef.current - shoulder.y) > 0.03
            : false;

          const hasHighPriorityViolation = hasElbowDrift || hasElbowFlare || hasShoulderShrug;

          // Track form violations during the current rep cycle
          if (hasHighPriorityViolation) {
            formViolationRef.current = true;
            repHadViolationRef.current = true;
            // Track specific violation type (priority order)
            if (hasElbowDrift) lastViolationTypeRef.current = "elbowDrift";
            else if (hasElbowFlare) lastViolationTypeRef.current = "elbowFlare";
            else if (hasShoulderShrug) lastViolationTypeRef.current = "shoulderShrug";
          }

          // Rep counting: down (>150) -> up (<60) -> down (>150) = 1 rep
          if (angle < 60 && phaseRef.current === "down") {
            phaseRef.current = "up";
            // Reset violation tracking at the start of a new rep cycle
            formViolationRef.current = false;
            repHadViolationRef.current = false;
            lastViolationTypeRef.current = null;
            // Mark violation immediately if form is already bad at the top
            if (hasHighPriorityViolation) {
              formViolationRef.current = true;
              repHadViolationRef.current = true;
              if (hasElbowDrift) lastViolationTypeRef.current = "elbowDrift";
              else if (hasElbowFlare) lastViolationTypeRef.current = "elbowFlare";
              else if (hasShoulderShrug) lastViolationTypeRef.current = "shoulderShrug";
            }
          } else if (angle > 150 && phaseRef.current === "up") {
            phaseRef.current = "down";
            if (formViolationRef.current) {
              // Invalid rep — don't count, show feedback
              setInvalidRep(true);
              setTimeout(() => setInvalidRep(false), 1200);
              setFeedback("Rep not counted — fix your form");
              setFeedbackType("correction");
              lastFeedbackTimeRef.current = Date.now();
            } else {
              hasCountedFirstRepRef.current = true;
              setReps((prev) => prev + 1);
              setValidRep(true);
              setTimeout(() => setValidRep(false), 1200);
            }
            formViolationRef.current = false;
            repHadViolationRef.current = false;
            lastViolationTypeRef.current = null;
          }

          // Capture baselines when in starting down phase
          if (phaseRef.current === "down" && angle > 150) {
            baselineElbowXRef.current = elbow.x;
            baselineElbowShoulderDxRef.current = Math.abs(elbow.x - shoulder.x);
            baselineShoulderYRef.current = shoulder.y;
          }

          // Throttled feedback (1500ms) — skip if we just showed invalid rep feedback
          const now = Date.now();
          if (now - lastFeedbackTimeRef.current >= 1500) {
            let newFeedback = "";
            let newType: FeedbackType = "neutral";

            const wristDev = Math.abs(wrist.x - elbow.x);

            // Pre-curl guidance (before user has started curling)
            if (!hasCurlStartedRef.current) {
              newFeedback = "Stand slightly side-on and keep your lifting arm clearly visible to begin";
              newType = "neutral";
            }
            // Priority: elbow drift → elbow flare → shoulder shrug → wrist dev → ROM → good/recovery
            else {
              if (hasElbowDrift) {
                newFeedback = "Keep your elbows pinned by your sides";
                newType = "correction";
              } else if (hasElbowFlare) {
                newFeedback = "Keep your elbow tucked in";
                newType = "correction";
              } else if (hasShoulderShrug) {
                newFeedback = "Don't shrug — keep shoulders down";
                newType = "correction";
              } else if (wristDev > 0.09) {
                newFeedback = "Straighten your wrist";
                newType = "correction";
              } else if (angle >= 60 && angle < 90) {
                newFeedback = "Curl a little higher for full range";
                newType = "neutral";
              } else if (repHadViolationRef.current && lastViolationTypeRef.current) {
                // Violation was corrected mid-rep — show recovery message
                newType = "neutral";
                switch (lastViolationTypeRef.current) {
                  case "elbowDrift":
                    newFeedback = "Better — keep your elbows pinned";
                    break;
                  case "elbowFlare":
                    newFeedback = "Better — keep your elbow tucked";
                    break;
                  case "shoulderShrug":
                    newFeedback = "Better — keep shoulders down";
                    break;
                }
              } else if (angle < 60) {
                newFeedback = "Great squeeze!";
                newType = "positive";
              } else {
                newFeedback = "Full extension — nice!";
                newType = "positive";
              }
            }

            setFeedback(newFeedback);
            setFeedbackType(newType);
            lastFeedbackTimeRef.current = now;
          }

          setIsDetecting(true);
        } else {
          setFeedback("Stand slightly side-on and keep your lifting arm clearly visible to begin");
          setFeedbackType("neutral");
          setIsDetecting(false);
        }
      });

      poseRef.current = pose;

      const camera = new CameraClass(video, {
        onFrame: async () => {
          if (!cancelled) await pose.send({ image: video });
        },
        width: 640,
        height: 480,
      });

      cameraRef.current = camera;
      camera.start();
    };

    loadPose();

    return () => {
      cancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      if (poseRef.current) {
        poseRef.current.close();
        poseRef.current = null;
      }
    };
  }, [selectedExerciseId, videoRef, canvasRef, resetState]);

  return { reps, feedback, feedbackType, isDetecting, invalidRep, validRep };
}
