import { useRef, useEffect, useState, useCallback } from "react";
import type { FeedbackType } from "@/components/FeedbackCard";

interface PoseDetectionResult {
  reps: number;
  feedback: string;
  feedbackType: FeedbackType;
  isDetecting: boolean;
  invalidRep: boolean;
  validRep: boolean;
  calibrationCountdown: number | null; // seconds remaining, null when not calibrating
}

type CalibrationState = "uncalibrated" | "calibrating" | "calibrated" | "recalibrating";

type ViolationType = "elbowForward" | "shoulderShrug" | "bodyMomentum" | "wristDeviation" | "elbowFlare";

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
  const [calibrationCountdown, setCalibrationCountdown] = useState<number | null>(null);

  const phaseRef = useRef<"up" | "down">("down");
  const poseRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const animFrameRef = useRef<number | null>(null);
  const showOverlayRef = useRef(showOverlay);
  const lastFeedbackTimeRef = useRef<number>(0);
  const hasCurlStartedRef = useRef(false);
  const hasCountedFirstRepRef = useRef(false);
  const formViolationRef = useRef(false);
  const repHadViolationRef = useRef(false);
  const lastViolationTypeRef = useRef<ViolationType | null>(null);

  // --- Calibration state machine refs ---
  const calibrationStateRef = useRef<CalibrationState>("uncalibrated");
  const stableFrameCountRef = useRef(0);
  const lastShoulderYRef = useRef<number | null>(null);
  const lowConfFrameCountRef = useRef(0);
  const calibrationCompleteTimeRef = useRef<number>(0);

  // --- Relative baselines (deltas, not absolute positions) ---
  // All checks use relative landmarks so whole-body movement doesn't trigger violations
  const baselineElbowShoulderZRef = useRef<number | null>(null); // elbow.z - shoulder.z
  const baselineShoulderHipYRef = useRef<number | null>(null);   // (shoulder.y - hip.y) / bodyScale
  const baselineHipShoulderZRef = useRef<number | null>(null);   // hip.z - shoulder.z
  const baselineWristElbowZRef = useRef<number | null>(null);    // wrist.z - elbow.z
  const baselineElbowHipXRef = useRef<number | null>(null);      // (elbow.x - hip.x) / bodyScale

  // Calibration constants
  const STABLE_FRAMES_REQUIRED = 120; // ~4 seconds at 30fps
  const RECALIB_LOW_CONF_FRAMES = 15;
  const RECALIB_COOLDOWN_MS = 3000;
  const SHOULDER_STABILITY_THRESHOLD = 0.008; // strict frame-to-frame shoulder movement

  const resetBaselines = useCallback(() => {
    baselineElbowShoulderZRef.current = null;
    baselineShoulderHipYRef.current = null;
    baselineHipShoulderZRef.current = null;
    baselineWristElbowZRef.current = null;
    baselineElbowHipXRef.current = null;
    stableFrameCountRef.current = 0;
    lastShoulderYRef.current = null;
    lowConfFrameCountRef.current = 0;
    setCalibrationCountdown(null);
  }, []);

  const resetState = useCallback(() => {
    setReps(0);
    setFeedback("Stand fully side-on, lifting arm closest to camera, arm fully extended");
    setFeedbackType("neutral");
    setIsDetecting(false);
    setInvalidRep(false);
    setValidRep(false);
    phaseRef.current = "down";
    lastFeedbackTimeRef.current = 0;
    hasCurlStartedRef.current = false;
    hasCountedFirstRepRef.current = false;
    formViolationRef.current = false;
    repHadViolationRef.current = false;
    lastViolationTypeRef.current = null;
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
      if (cameraRef.current) { cameraRef.current.stop(); cameraRef.current = null; }
      if (poseRef.current) { poseRef.current.close(); poseRef.current = null; }
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

        if (!results.poseLandmarks) {
          lowConfFrameCountRef.current++;
          setFeedback("Stand fully side-on, lifting arm closest to camera, arm fully extended");
          setFeedbackType("neutral");
          setIsDetecting(false);
          return;
        }

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

        // Auto-detect which arm to track based on visibility
        const leftVis = ((lm[11].visibility ?? 0) + (lm[13].visibility ?? 0) + (lm[15].visibility ?? 0)) / 3;
        const rightVis = ((lm[12].visibility ?? 0) + (lm[14].visibility ?? 0) + (lm[16].visibility ?? 0)) / 3;
        const isLeft = leftVis >= rightVis;

        const shoulder = isLeft ? lm[11] : lm[12];
        const elbow    = isLeft ? lm[13] : lm[14];
        const wrist    = isLeft ? lm[15] : lm[16];
        const hip      = isLeft ? lm[23] : lm[24];

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
        // LOW CONFIDENCE TRACKING
        // =============================================
        if (minVis <= 0.5) {
          lowConfFrameCountRef.current++;
        } else {
          lowConfFrameCountRef.current = 0;
        }

        // =============================================
        // CALIBRATION STATE MACHINE
        // =============================================
        if (calState !== "calibrated") {
          if (minVis <= 0.5) {
            stableFrameCountRef.current = 0;
            lastShoulderYRef.current = null;
            setCalibrationCountdown(null);
            if (now - lastFeedbackTimeRef.current >= 1500) {
              setFeedback("Make sure your full side profile is clearly visible");
              setFeedbackType("neutral");
              lastFeedbackTimeRef.current = now;
            }
            setIsDetecting(false);
            return;
          }

          const allHighConf = minVis > 0.7;
          const armExtended = angle > 150;
          const shoulderStable =
            lastShoulderYRef.current === null ||
            Math.abs(shoulder.y - lastShoulderYRef.current) < SHOULDER_STABILITY_THRESHOLD;

          if (allHighConf && armExtended && shoulderStable) {
            stableFrameCountRef.current++;
            if (calState === "uncalibrated") {
              calibrationStateRef.current = "calibrating";
            }
            // Countdown based on 30fps
            const framesLeft = STABLE_FRAMES_REQUIRED - stableFrameCountRef.current;
            const secondsLeft = Math.ceil(framesLeft / 30);
            setCalibrationCountdown(secondsLeft > 0 ? secondsLeft : 1);
          } else {
            stableFrameCountRef.current = 0;
            setCalibrationCountdown(null);
          }

          lastShoulderYRef.current = shoulder.y;

          if (stableFrameCountRef.current >= STABLE_FRAMES_REQUIRED) {
            // Lock all relative baselines
            baselineElbowShoulderZRef.current = elbow.z - shoulder.z;
            baselineShoulderHipYRef.current   = (shoulder.y - hip.y) / bodyScale;
            baselineHipShoulderZRef.current   = hip.z - shoulder.z;
            baselineWristElbowZRef.current    = wrist.z - elbow.z;
            baselineElbowHipXRef.current      = (elbow.x - hip.x) / bodyScale;

            calibrationStateRef.current = "calibrated";
            calibrationCompleteTimeRef.current = now;
            setCalibrationCountdown(null);
            setFeedback("Ready! Start your reps");
            setFeedbackType("positive");
            lastFeedbackTimeRef.current = now;
            setIsDetecting(true);
            return;
          }

          const label = calState === "recalibrating" ? "Recalibrating..." : "Hold still to calibrate...";
          if (now - lastFeedbackTimeRef.current >= 1500) {
            setFeedback(label);
            setFeedbackType("neutral");
            lastFeedbackTimeRef.current = now;
          }
          setIsDetecting(false);
          return;
        }

        // =============================================
        // CALIBRATED — low conf recalibration check
        // =============================================
        if (minVis <= 0.5) {
          if (now - lastFeedbackTimeRef.current >= 1500) {
            setFeedback("Make sure your full side profile is clearly visible");
            setFeedbackType("neutral");
            lastFeedbackTimeRef.current = now;
          }
          setIsDetecting(false);
          if (
            lowConfFrameCountRef.current >= RECALIB_LOW_CONF_FRAMES &&
            now - calibrationCompleteTimeRef.current > RECALIB_COOLDOWN_MS
          ) {
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
          }
          return;
        }

        // =============================================
        // NORMAL DETECTION
        // All checks use RELATIVE landmark deltas —
        // whole-body movement does not trigger violations
        // =============================================

        if (!hasCurlStartedRef.current && angle < 140) {
          hasCurlStartedRef.current = true;
        }

        // ---- VIOLATION CHECKS ----
        // All disabled — enable and test one at a time

        // 1. Elbow forward: elbow drifting toward camera relative to shoulder
        const currentElbowShoulderZ = elbow.z - shoulder.z;
        const hasElbowForward = false; // DISABLED
        void currentElbowShoulderZ; // suppress unused warning

        // 2. Shoulder shrug: shoulder rising relative to hip
        const currentShoulderHipY = (shoulder.y - hip.y) / bodyScale;
        const hasShoulderShrug = false; // DISABLED
        void currentShoulderHipY;

        // 3. Body momentum: hip thrusting forward relative to shoulder
        const currentHipShoulderZ = hip.z - shoulder.z;
        const hasBodyMomentum = false; // DISABLED
        void currentHipShoulderZ;

        // 4. Wrist deviation: wrist rotating away from neutral relative to elbow
        const currentWristElbowZ = wrist.z - elbow.z;
        const hasWristDeviation = false; // DISABLED
        void currentWristElbowZ;

        // 5. Elbow flare: elbow swinging out sideways relative to hip
        const currentElbowHipX = (elbow.x - hip.x) / bodyScale;
        const hasElbowFlare =
          baselineElbowHipXRef.current !== null &&
          Math.abs(currentElbowHipX - baselineElbowHipXRef.current) > 0.15;
        // TUNE: raise toward 0.20 if triggering on normal movement

        const hasHighPriorityViolation =
          hasElbowForward || hasShoulderShrug || hasBodyMomentum || hasWristDeviation || hasElbowFlare;

        // Track violations during rep cycle
        if (hasHighPriorityViolation) {
          formViolationRef.current = true;
          repHadViolationRef.current = true;
          if (hasElbowForward) lastViolationTypeRef.current = "elbowForward";
          else if (hasBodyMomentum) lastViolationTypeRef.current = "bodyMomentum";
          else if (hasElbowFlare) lastViolationTypeRef.current = "elbowFlare";
          else if (hasShoulderShrug) lastViolationTypeRef.current = "shoulderShrug";
          else if (hasWristDeviation) lastViolationTypeRef.current = "wristDeviation";
        }

        // Rep counting: down (>150°) → up (<60°) → down (>150°) = 1 rep
        if (angle < 60 && phaseRef.current === "down") {
          phaseRef.current = "up";
          formViolationRef.current = false;
          repHadViolationRef.current = false;
          lastViolationTypeRef.current = null;
          if (hasHighPriorityViolation) {
            formViolationRef.current = true;
            repHadViolationRef.current = true;
            if (hasElbowForward) lastViolationTypeRef.current = "elbowForward";
            else if (hasBodyMomentum) lastViolationTypeRef.current = "bodyMomentum";
            else if (hasElbowFlare) lastViolationTypeRef.current = "elbowFlare";
            else if (hasShoulderShrug) lastViolationTypeRef.current = "shoulderShrug";
            else if (hasWristDeviation) lastViolationTypeRef.current = "wristDeviation";
          }
        } else if (angle > 150 && phaseRef.current === "up") {
          phaseRef.current = "down";
          if (formViolationRef.current) {
            setInvalidRep(true);
            setTimeout(() => setInvalidRep(false), 1200);
            setFeedback("Rep not counted — fix your form");
            setFeedbackType("correction");
            lastFeedbackTimeRef.current = now;
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

        // Throttled real-time feedback (1500ms)
        if (now - lastFeedbackTimeRef.current >= 1500) {
          let newFeedback = "";
          let newType: FeedbackType = "neutral";

          if (!hasCurlStartedRef.current) {
            newFeedback = "Stand fully side-on, lifting arm closest to camera, arm fully extended";
            newType = "neutral";
          } else if (hasElbowForward) {
            newFeedback = "Elbow drifting forward — keep it pinned to your side";
            newType = "correction";
          } else if (hasBodyMomentum) {
            newFeedback = "Don't use your body — keep your torso still";
            newType = "correction";
          } else if (hasElbowFlare) {
            newFeedback = "Elbow flaring out — tuck it back in";
            newType = "correction";
          } else if (hasShoulderShrug) {
            newFeedback = "Don't shrug — keep your shoulder down";
            newType = "correction";
          } else if (hasWristDeviation) {
            newFeedback = "Keep your wrist straight";
            newType = "correction";
          } else if (angle >= 60 && angle < 90) {
            newFeedback = "Curl a little higher for full range";
            newType = "neutral";
          } else if (repHadViolationRef.current && lastViolationTypeRef.current) {
            newType = "neutral";
            switch (lastViolationTypeRef.current) {
              case "elbowForward":
                newFeedback = "Better — keep that elbow pinned";
                break;
              case "bodyMomentum":
                newFeedback = "Better — keep your torso still";
                break;
              case "elbowFlare":
                newFeedback = "Better — keep that elbow tucked";
                break;
              case "shoulderShrug":
                newFeedback = "Better — keep your shoulder down";
                break;
              case "wristDeviation":
                newFeedback = "Better — keep that wrist straight";
                break;
            }
          } else if (angle < 60) {
            newFeedback = "Great squeeze at the top!";
            newType = "positive";
          } else {
            newFeedback = "Full extension — nice control!";
            newType = "positive";
          }

          setFeedback(newFeedback);
          setFeedbackType(newType);
          lastFeedbackTimeRef.current = now;
        }

        setIsDetecting(true);
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
      if (cameraRef.current) { cameraRef.current.stop(); cameraRef.current = null; }
      if (poseRef.current) { poseRef.current.close(); poseRef.current = null; }
    };
  }, [selectedExerciseId, videoRef, canvasRef, resetState, resetBaselines]);

  return { reps, feedback, feedbackType, isDetecting, invalidRep, validRep, calibrationCountdown };
}
