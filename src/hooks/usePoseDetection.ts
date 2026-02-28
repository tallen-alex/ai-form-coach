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

type CalibrationState = "uncalibrated" | "calibrating" | "calibrated" | "recalibrating";

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
  const baselineElbowZDiffRef = useRef<number | null>(null);
  const hasCountedFirstRepRef = useRef(false);
  const hasCurlStartedRef = useRef(false);
  const showOverlayRef = useRef(showOverlay);
  const formViolationRef = useRef(false);
  const lastViolationTypeRef = useRef<"elbowDrift" | "elbowFlare" | "elbowForward" | "shoulderShrug" | null>(null);
  const repHadViolationRef = useRef(false);

  // --- Calibration state machine refs ---
  const calibrationStateRef = useRef<CalibrationState>("uncalibrated");
  const stableFrameCountRef = useRef(0);
  const lastShoulderYRef = useRef<number | null>(null);
  const lowConfFrameCountRef = useRef(0);
  const shoulderYHistoryRef = useRef<number[]>([]);
  const calibrationCompleteTimeRef = useRef<number>(0);
  const shownReadyMessageRef = useRef(false);

  const STABLE_FRAMES_REQUIRED = 20;
  const RECALIB_LOW_CONF_FRAMES = 10;
  const RECALIB_COOLDOWN_MS = 3000;
  const SHOULDER_STABILITY_THRESHOLD = 0.02; // max shoulder Y movement between frames during calibration
  const RECALIB_SHOULDER_SHIFT = 0.2; // * bodyScale

  const resetBaselines = useCallback(() => {
    baselineElbowXRef.current = null;
    baselineElbowShoulderDxRef.current = null;
    baselineShoulderYRef.current = null;
    baselineElbowZDiffRef.current = null;
    stableFrameCountRef.current = 0;
    lastShoulderYRef.current = null;
    lowConfFrameCountRef.current = 0;
    shoulderYHistoryRef.current = [];
    shownReadyMessageRef.current = false;
  }, []);

  const resetState = useCallback(() => {
    setReps(0);
    setFeedback("Stand slightly side-on and keep your lifting arm clearly visible to begin");
    setFeedbackType("neutral");
    setIsDetecting(false);
    setInvalidRep(false);
    setValidRep(false);
    phaseRef.current = "down";
    lastFeedbackTimeRef.current = 0;
    hasCountedFirstRepRef.current = false;
    hasCurlStartedRef.current = false;
    formViolationRef.current = false;
    lastViolationTypeRef.current = null;
    repHadViolationRef.current = false;
    calibrationStateRef.current = "uncalibrated";
    calibrationCompleteTimeRef.current = 0;
    resetBaselines();
  }, [resetBaselines]);

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

          const bodyScale = Math.abs(shoulder.y - hip.y) || 0.2;
          const angle = angleBetween(shoulder, elbow, wrist);
          const calState = calibrationStateRef.current;
          const now = Date.now();

          // =============================================
          // CALIBRATION STATE MACHINE
          // =============================================

          // --- Handle low-confidence recalibration trigger ---
          if (minVis <= 0.5) {
            lowConfFrameCountRef.current++;
          } else {
            lowConfFrameCountRef.current = 0;
          }

          // --- uncalibrated / calibrating / recalibrating ---
          if (calState === "uncalibrated" || calState === "calibrating" || calState === "recalibrating") {
            if (minVis <= 0.5) {
              // Not enough confidence, reset stable count
              stableFrameCountRef.current = 0;
              lastShoulderYRef.current = null;
              if (calState === "uncalibrated") {
                calibrationStateRef.current = "uncalibrated";
              }
              const feedbackNow = Date.now();
              if (feedbackNow - lastFeedbackTimeRef.current >= 1500) {
                setFeedback("Make sure your side profile and lifting arm are clearly visible");
                setFeedbackType("neutral");
                lastFeedbackTimeRef.current = feedbackNow;
              }
              setIsDetecting(false);
              return;
            }

            // High confidence frame — check stability for calibration
            const allHighConf = minVis > 0.7;
            const armExtended = angle > 150;
            const shoulderStable = lastShoulderYRef.current === null ||
              Math.abs(shoulder.y - lastShoulderYRef.current) < SHOULDER_STABILITY_THRESHOLD;

            if (allHighConf && armExtended && shoulderStable) {
              stableFrameCountRef.current++;
              if (calState === "uncalibrated") {
                calibrationStateRef.current = "calibrating";
              }
            } else {
              stableFrameCountRef.current = 0;
            }

            lastShoulderYRef.current = shoulder.y;

            if (stableFrameCountRef.current >= STABLE_FRAMES_REQUIRED) {
              // Lock baselines
              baselineElbowXRef.current = elbow.x;
              baselineElbowShoulderDxRef.current = Math.abs(elbow.x - shoulder.x);
              baselineShoulderYRef.current = shoulder.y;
              baselineElbowZDiffRef.current = elbow.z - shoulder.z;
              shoulderYHistoryRef.current = [];
              calibrationStateRef.current = "calibrated";
              calibrationCompleteTimeRef.current = Date.now();
              shownReadyMessageRef.current = false;

              setFeedback("Ready! Start your reps");
              setFeedbackType("positive");
              lastFeedbackTimeRef.current = Date.now();
              shownReadyMessageRef.current = true;
              setIsDetecting(true);
              return;
            }

            // Show calibrating feedback
            const label = calState === "recalibrating" ? "Recalibrating..." : "Hold still to calibrate...";
            if (now - lastFeedbackTimeRef.current >= 1500) {
              setFeedback(label);
              setFeedbackType("neutral");
              lastFeedbackTimeRef.current = now;
            }
            setIsDetecting(false);
            return;
          }

          // --- calibrated state: normal detection + recalibration checks ---

          // Low confidence gate (existing behavior)
          if (minVis <= 0.5) {
            if (now - lastFeedbackTimeRef.current >= 1500) {
              setFeedback("Make sure your side profile and lifting arm are clearly visible");
              setFeedbackType("neutral");
              lastFeedbackTimeRef.current = now;
            }
            setIsDetecting(false);

            // Check recalibration: 10+ consecutive low-conf frames, past cooldown
            if (
              lowConfFrameCountRef.current >= RECALIB_LOW_CONF_FRAMES &&
              now - calibrationCompleteTimeRef.current > RECALIB_COOLDOWN_MS
            ) {
              calibrationStateRef.current = "recalibrating";
              resetBaselines();
              calibrationStateRef.current = "uncalibrated"; // will transition to calibrating
              setFeedback("Recalibrating...");
              setFeedbackType("neutral");
              lastFeedbackTimeRef.current = now;
            }
            return;
          }

          // Rolling shoulder Y history for recalibration detection
          shoulderYHistoryRef.current.push(shoulder.y);
          if (shoulderYHistoryRef.current.length > 5) {
            shoulderYHistoryRef.current.shift();
          }

          // Check rolling shoulder shift recalibration
          if (
            baselineShoulderYRef.current !== null &&
            shoulderYHistoryRef.current.length === 5 &&
            now - calibrationCompleteTimeRef.current > RECALIB_COOLDOWN_MS
          ) {
            const avgShoulderY = shoulderYHistoryRef.current.reduce((a, b) => a + b, 0) / 5;
            const shift = Math.abs(avgShoulderY - baselineShoulderYRef.current);
            if (shift > RECALIB_SHOULDER_SHIFT * bodyScale) {
              // Trigger recalibration — preserve reps
              calibrationStateRef.current = "uncalibrated";
              resetBaselines();
              hasCurlStartedRef.current = false;
              phaseRef.current = "down";
              formViolationRef.current = false;
              repHadViolationRef.current = false;
              lastViolationTypeRef.current = null;
              setFeedback("Recalibrating...");
              setFeedbackType("neutral");
              lastFeedbackTimeRef.current = now;
              setIsDetecting(false);
              return;
            }
          }

          // =============================================
          // NORMAL DETECTION (only when calibrated)
          // =============================================

          // Track when user has meaningfully started curling
          if (!hasCurlStartedRef.current && angle < 140) {
            hasCurlStartedRef.current = true;
          }

          // --- FORM VIOLATION CHECKS ---

          // Elbow drift: elbow moving away from body sideways vs baseline
          const baselineDx = baselineElbowShoulderDxRef.current;
          const currentDx = Math.abs(elbow.x - shoulder.x);
          const hasElbowDrift = baselineDx !== null && (currentDx - baselineDx) / bodyScale > 0.15;

          // Elbow flare: absolute sideways distance from shoulder, normalized
          const hasElbowFlare = Math.abs(elbow.x - shoulder.x) / bodyScale > 0.35;

          // Elbow forward projection (disabled)
          const hasElbowForward = false;

          // Shoulder shrug: shoulder rising above baseline, normalized
          const hasShoulderShrug = baselineShoulderYRef.current !== null
            ? (baselineShoulderYRef.current - shoulder.y) / bodyScale > 0.12
            : false;

          const hasHighPriorityViolation = hasElbowDrift || hasElbowFlare || hasElbowForward || hasShoulderShrug;

          // Track form violations during the current rep cycle
          if (hasHighPriorityViolation) {
            formViolationRef.current = true;
            repHadViolationRef.current = true;
            if (hasElbowDrift) lastViolationTypeRef.current = "elbowDrift";
            else if (hasElbowForward) lastViolationTypeRef.current = "elbowForward";
            else if (hasElbowFlare) lastViolationTypeRef.current = "elbowFlare";
            else if (hasShoulderShrug) lastViolationTypeRef.current = "shoulderShrug";
          }

          // Rep counting: down (>150) -> up (<60) -> down (>150) = 1 rep
          if (angle < 60 && phaseRef.current === "down") {
            phaseRef.current = "up";
            formViolationRef.current = false;
            repHadViolationRef.current = false;
            lastViolationTypeRef.current = null;
            if (hasHighPriorityViolation) {
              formViolationRef.current = true;
              repHadViolationRef.current = true;
              if (hasElbowDrift) lastViolationTypeRef.current = "elbowDrift";
              else if (hasElbowForward) lastViolationTypeRef.current = "elbowForward";
              else if (hasElbowFlare) lastViolationTypeRef.current = "elbowFlare";
              else if (hasShoulderShrug) lastViolationTypeRef.current = "shoulderShrug";
            }
          } else if (angle > 150 && phaseRef.current === "up") {
            phaseRef.current = "down";
            if (formViolationRef.current) {
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

          // Throttled feedback (1500ms)
          if (now - lastFeedbackTimeRef.current >= 1500) {
            let newFeedback = "";
            let newType: FeedbackType = "neutral";

            const wristDev = Math.abs(wrist.x - elbow.x);

            if (!hasCurlStartedRef.current) {
              newFeedback = "Stand slightly side-on and keep your lifting arm clearly visible to begin";
              newType = "neutral";
            } else {
              if (hasElbowDrift) {
                newFeedback = "Keep your elbows pinned by your sides";
                newType = "correction";
              } else if (hasElbowForward) {
                newFeedback = "Don't let your elbow drift forward";
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
                newType = "neutral";
                switch (lastViolationTypeRef.current) {
                  case "elbowDrift":
                    newFeedback = "Better — keep your elbows pinned";
                    break;
                  case "elbowForward":
                    newFeedback = "Better — keep your elbow back";
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
          // No landmarks — if calibrated, start low-conf counting
          lowConfFrameCountRef.current++;
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
  }, [selectedExerciseId, videoRef, canvasRef, resetState, resetBaselines]);

  return { reps, feedback, feedbackType, isDetecting, invalidRep, validRep };
}
