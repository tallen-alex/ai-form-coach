import { useRef, useEffect, useState, useCallback } from "react";
import type { FeedbackType } from "@/components/FeedbackCard";

interface PoseDetectionResult {
  reps: number;
  feedback: string;
  feedbackType: FeedbackType;
  isDetecting: boolean;
  invalidRep: boolean;
  validRep: boolean;
  calibrationCountdown: number | null;
}

type CalibrationState = "uncalibrated" | "calibrating" | "calibrated" | "recalibrating";

function angleBetween(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
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
  showOverlay: boolean = true,
): PoseDetectionResult {
  const [reps, setReps] = useState(0);
  const [feedback, setFeedback] = useState("Position yourself in frame");
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("neutral");
  const [isDetecting, setIsDetecting] = useState(false);
  const [invalidRep, setInvalidRep] = useState(false);
  const [validRep, setValidRep] = useState(false);
  const [calibrationCountdown, setCalibrationCountdown] = useState<number | null>(null);

  const phaseRef = useRef<"up" | "down">("down");
  const animFrameRef = useRef<number | null>(null);
  const poseRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const lastFeedbackTimeRef = useRef<number>(0);
  const baselineElbowXRef = useRef<number | null>(null);
  const baselineElbowShoulderDxRef = useRef<number | null>(null);
  const baselineShoulderYRef = useRef<number | null>(null);
  const baselineElbowZDiffRef = useRef<number | null>(null);
  const baselineElbowHipXRef = useRef<number | null>(null); // elbow.x - hip.x relative baseline for flare
  const baselineElbowShoulderZRef = useRef<number | null>(null); // elbow.z - shoulder.z baseline for forward drift
  const hasCountedFirstRepRef = useRef(false);
  const hasCurlStartedRef = useRef(false);
  const showOverlayRef = useRef(showOverlay);
  const formViolationRef = useRef(false);
  const lastViolationTypeRef = useRef<"elbowDrift" | "elbowFlare" | "elbowForward" | "shoulderShrug" | null>(null);
  const repHadViolationRef = useRef(false);
  const lastDebugLogRef = useRef(0);

  // --- Calibration state machine refs ---
  const calibrationStateRef = useRef<CalibrationState>("uncalibrated");
  const stableFrameCountRef = useRef(0);
  const lastShoulderYRef = useRef<number | null>(null);
  const lowConfFrameCountRef = useRef(0);
  const shoulderYHistoryRef = useRef<number[]>([]);
  const calibrationCompleteTimeRef = useRef<number>(0);
  const shownReadyMessageRef = useRef(false);

  const STABLE_FRAMES_REQUIRED = 60;
  const RECALIB_LOW_CONF_FRAMES = 10;
  const RECALIB_COOLDOWN_MS = 3000;
  const SHOULDER_STABILITY_THRESHOLD = 0.008;
  const RECALIB_SHOULDER_SHIFT = 0.5;

  const resetBaselines = useCallback(() => {
    baselineElbowXRef.current = null;
    baselineElbowShoulderDxRef.current = null;
    baselineShoulderYRef.current = null;
    baselineElbowZDiffRef.current = null;
    baselineElbowHipXRef.current = null;
    baselineElbowShoulderZRef.current = null;
    stableFrameCountRef.current = 0;
    lastShoulderYRef.current = null;
    lowConfFrameCountRef.current = 0;
    shoulderYHistoryRef.current = [];
    shownReadyMessageRef.current = false;
    setCalibrationCountdown(null);
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
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
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

          const leftVis = ((lm[11].visibility ?? 0) + (lm[13].visibility ?? 0) + (lm[15].visibility ?? 0)) / 3;
          const rightVis = ((lm[12].visibility ?? 0) + (lm[14].visibility ?? 0) + (lm[16].visibility ?? 0)) / 3;
          const isLeft = leftVis >= rightVis;

          const shoulder = isLeft ? lm[11] : lm[12];
          const elbow = isLeft ? lm[13] : lm[14];
          const wrist = isLeft ? lm[15] : lm[16];
          const hip = isLeft ? lm[23] : lm[24];

          const minVis = Math.min(
            shoulder.visibility ?? 0,
            elbow.visibility ?? 0,
            wrist.visibility ?? 0,
            hip.visibility ?? 0,
          );

          const bodyScale = Math.abs(shoulder.y - hip.y) || 0.2;
          const angle = angleBetween(shoulder, elbow, wrist);
          const calState = calibrationStateRef.current;
          const now = Date.now();

          // =============================================
          // CALIBRATION STATE MACHINE
          // =============================================

          if (minVis <= 0.5) {
            lowConfFrameCountRef.current++;
          } else {
            lowConfFrameCountRef.current = 0;
          }

          if (calState === "uncalibrated" || calState === "calibrating" || calState === "recalibrating") {
            if (minVis <= 0.5) {
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

            const allHighConf = minVis > 0.7;
            const armExtended = angle > 150;
            const shoulderStable =
              lastShoulderYRef.current === null ||
              Math.abs(shoulder.y - lastShoulderYRef.current) < SHOULDER_STABILITY_THRESHOLD;

            // Side-on orientation gate: in true side-on, the two shoulders have very
            // different Z values (one is much closer to camera). If they are similar,
            // the user is facing forward or at an angle — reject calibration.
            const shoulderZSpread = Math.abs(lm[11].z - lm[12].z);
            const isSideOn = shoulderZSpread > 0.15;
            // TUNE: lower toward 0.10 if side-on users aren't passing the gate

            if (allHighConf && armExtended && shoulderStable && isSideOn) {
              stableFrameCountRef.current++;
              if (calState === "uncalibrated") {
                calibrationStateRef.current = "calibrating";
              }
              const framesLeft = STABLE_FRAMES_REQUIRED - stableFrameCountRef.current;
              const secondsLeft = Math.ceil(framesLeft / 30); // 30fps
              setCalibrationCountdown(secondsLeft > 0 ? secondsLeft : 1);
            } else {
              stableFrameCountRef.current = 0;
              setCalibrationCountdown(null);
              if (!isSideOn && now - lastFeedbackTimeRef.current >= 1500) {
                setFeedback("Turn fully side-on — lifting arm closest to camera");
                setFeedbackType("neutral");
                lastFeedbackTimeRef.current = now;
              }
            }

            lastShoulderYRef.current = shoulder.y;

            if (stableFrameCountRef.current >= STABLE_FRAMES_REQUIRED) {
              baselineElbowXRef.current = elbow.x;
              baselineElbowShoulderDxRef.current = Math.abs(elbow.x - shoulder.x);
              baselineShoulderYRef.current = shoulder.y;
              baselineElbowZDiffRef.current = elbow.z - shoulder.z;
              baselineElbowHipXRef.current = elbow.x - hip.x;
              baselineElbowShoulderZRef.current = elbow.z - shoulder.z;
              shoulderYHistoryRef.current = [];
              calibrationStateRef.current = "calibrated";
              calibrationCompleteTimeRef.current = Date.now();
              shownReadyMessageRef.current = false;
              setCalibrationCountdown(null);

              setFeedback("Ready! Start your reps");
              setFeedbackType("positive");
              lastFeedbackTimeRef.current = Date.now();
              shownReadyMessageRef.current = true;
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

          // --- calibrated state ---

          if (minVis <= 0.5) {
            if (now - lastFeedbackTimeRef.current >= 1500) {
              setFeedback("Make sure your side profile and lifting arm are clearly visible");
              setFeedbackType("neutral");
              lastFeedbackTimeRef.current = now;
            }
            setIsDetecting(false);

            if (
              lowConfFrameCountRef.current >= RECALIB_LOW_CONF_FRAMES &&
              now - calibrationCompleteTimeRef.current > RECALIB_COOLDOWN_MS
            ) {
              calibrationStateRef.current = "recalibrating";
              resetBaselines();
              calibrationStateRef.current = "uncalibrated";
              setFeedback("Recalibrating...");
              setFeedbackType("neutral");
              lastFeedbackTimeRef.current = now;
            }
            return;
          }

          shoulderYHistoryRef.current.push(shoulder.y);
          if (shoulderYHistoryRef.current.length > 5) {
            shoulderYHistoryRef.current.shift();
          }

          if (
            baselineShoulderYRef.current !== null &&
            shoulderYHistoryRef.current.length === 5 &&
            now - calibrationCompleteTimeRef.current > RECALIB_COOLDOWN_MS
          ) {
            const avgShoulderY = shoulderYHistoryRef.current.reduce((a, b) => a + b, 0) / 5;
            const shift = Math.abs(avgShoulderY - baselineShoulderYRef.current);
            if (shift > RECALIB_SHOULDER_SHIFT * bodyScale) {
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

          if (!hasCurlStartedRef.current && angle < 140) {
            hasCurlStartedRef.current = true;
          }

          // --- FORM VIOLATION CHECKS ---
          // All disabled except elbow flare — enable and test one at a time

          // Elbow drift: DISABLED
          const hasElbowDrift = false;

          // Elbow flare: elbow swinging sideways away from hip line, relative to baseline
          // In side-on view elbow.x - hip.x changes when elbow flares out
          const currentElbowHipX = elbow.x - hip.x;
          const currentElbowShoulderX = elbow.x - shoulder.x;
          const currentElbowShoulderZ = elbow.z - shoulder.z;
          const currentElbowShoulderZDiff = elbow.z - shoulder.z;
          const hasElbowFlare =
            baselineElbowHipXRef.current !== null &&
            Math.abs(currentElbowHipX - baselineElbowHipXRef.current) / bodyScale > 0.08;
          // TUNE: raise toward 0.18 if triggering on normal reps; lower toward 0.08 if not triggering

          // DEBUG: log raw values every ~30 frames to help tune thresholds
          // Remove this block once detection is working
          if (now - lastDebugLogRef.current >= 5000) {
            lastDebugLogRef.current = now;
            console.log("[FORM DEBUG]", {
              elbowHipX_delta:
                baselineElbowHipXRef.current !== null
                  ? ((currentElbowHipX - baselineElbowHipXRef.current) / bodyScale).toFixed(3)
                  : "no baseline",
              elbowShoulderX: (currentElbowShoulderX / bodyScale).toFixed(3),
              elbowShoulderZ: currentElbowShoulderZ.toFixed(3),
              elbowShoulderZ_delta: baselineElbowShoulderZRef.current !== null ? (currentElbowShoulderZDiff - baselineElbowShoulderZRef.current).toFixed(3) : "no baseline",
              baselineElbowHipX: baselineElbowHipXRef.current?.toFixed(3) ?? "null",
              bodyScale: bodyScale.toFixed(3),
              hasElbowFlare,
              angle: angle.toFixed(1),
            });
          }

          // Elbow forward: elbow moving toward camera relative to shoulder (Z axis)
          const hasElbowForward =
            baselineElbowShoulderZRef.current !== null &&
            (currentElbowShoulderZDiff - baselineElbowShoulderZRef.current) < -0.10;
          // TUNE: less negative (e.g. -0.07) if not triggering; more negative (e.g. -0.15) if too sensitive

          // Shoulder shrug: DISABLED
          const hasShoulderShrug = false;

          const hasHighPriorityViolation = hasElbowDrift || hasElbowFlare || hasElbowForward || hasShoulderShrug;
          // Active checks: elbowFlare ✓  elbowForward ✓  elbowDrift ✗  shoulderShrug ✗

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
              } else if (angle >= 60 && angle < 90) {
                // ROM suggestion — lowest priority, only shows when form is clean
                newFeedback = "Curl a little higher for full range";
                newType = "neutral";
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

  return { reps, feedback, feedbackType, isDetecting, invalidRep, validRep, calibrationCountdown };
}
