// Custom React hook for pose detection and analysis using MediaPipe Pose
import { useEffect, useRef, useState, useCallback } from "react";
import type { FeedbackType } from "@/components/FeedbackCard";

// MediaPipe types
interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

interface PoseResults {
  poseLandmarks?: Landmark[];
  image: HTMLVideoElement | HTMLCanvasElement;
}

interface FeedbackState {
  message: string;
  type: FeedbackType;
}

// Pose landmark connections for skeleton drawing
const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26],
  [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32],
  [15, 17], [15, 19], [16, 18], [16, 20],
];

// MediaPipe landmark indices
// 11 = left shoulder, 12 = right shoulder
// 13 = left elbow,    14 = right elbow
// 15 = left wrist,    16 = right wrist
// 23 = left hip,      24 = right hip

function angleBetween(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);
  const cosAngle = dot / (magAB * magCB + 1e-6);
  return Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
}

// Bicep curl thresholds
// Elbow angle at full extension (arm down) ~ 160-180 degrees
// Elbow angle at full curl (arm up)        ~ 30-50 degrees
const CURL_DOWN_ANGLE = 150; // arm is considered "down" / extended
const CURL_UP_ANGLE = 60;    // arm is considered "up" / curled
const ELBOW_FLARE_THRESHOLD = 0.08; // how far elbow can drift sideways from shoulder
const WRIST_DEVIATION_THRESHOLD = 0.06; // wrist should stay roughly aligned with elbow

export function usePoseDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const [repCount, setRepCount] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackState>({
    message: "Get into position",
    type: "neutral",
  });
  const [isLoading, setIsLoading] = useState(true);

  // Track phase per arm independently
  const leftPhase = useRef<"up" | "down">("down");
  const rightPhase = useRef<"up" | "down">("down");
  const lastFeedbackTime = useRef(0);
  const poseRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  const drawSkeleton = useCallback(
    (landmarks: Landmark[], ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);

      // Draw connections
      ctx.strokeStyle = "hsl(145, 72%, 50%)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (const [i, j] of POSE_CONNECTIONS) {
        const a = landmarks[i];
        const b = landmarks[j];
        if (a && b && (a.visibility ?? 0) > 0.5 && (b.visibility ?? 0) > 0.5) {
          ctx.beginPath();
          ctx.moveTo(a.x * w, a.y * h);
          ctx.lineTo(b.x * w, b.y * h);
          ctx.stroke();
        }
      }

      // Draw landmarks
      for (const lm of landmarks) {
        if ((lm.visibility ?? 0) > 0.5) {
          ctx.beginPath();
          ctx.arc(lm.x * w, lm.y * h, 5, 0, 2 * Math.PI);
          ctx.fillStyle = "hsl(0, 0%, 95%)";
          ctx.fill();
          ctx.strokeStyle = "hsl(145, 72%, 50%)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    },
    []
  );

  const analyzePose = useCallback(
    (landmarks: Landmark[]) => {
      const now = Date.now();

      // Landmarks for bicep curl
      const lShoulder = landmarks[11];
      const rShoulder = landmarks[12];
      const lElbow = landmarks[13];
      const rElbow = landmarks[14];
      const lWrist = landmarks[15];
      const rWrist = landmarks[16];
      const lHip = landmarks[23];
      const rHip = landmarks[24];

      // Need at least one arm visible
      const leftVisible =
        lShoulder && lElbow && lWrist &&
        (lShoulder.visibility ?? 0) > 0.5 &&
        (lElbow.visibility ?? 0) > 0.5 &&
        (lWrist.visibility ?? 0) > 0.5;

      const rightVisible =
        rShoulder && rElbow && rWrist &&
        (rShoulder.visibility ?? 0) > 0.5 &&
        (rElbow.visibility ?? 0) > 0.5 &&
        (rWrist.visibility ?? 0) > 0.5;

      if (!leftVisible && !rightVisible) return;

      // Calculate elbow angles (shoulder - elbow - wrist)
      const leftElbowAngle = leftVisible
        ? angleBetween(lShoulder, lElbow, lWrist)
        : null;
      const rightElbowAngle = rightVisible
        ? angleBetween(rShoulder, rElbow, rWrist)
        : null;

      // ── Rep counting ──────────────────────────────────────────────────────
      // Count a rep when arm goes from "down" (extended) to "up" (curled) and back

      if (leftElbowAngle !== null) {
        if (leftElbowAngle > CURL_DOWN_ANGLE && leftPhase.current === "up") {
          leftPhase.current = "down";
        } else if (leftElbowAngle < CURL_UP_ANGLE && leftPhase.current === "down") {
          leftPhase.current = "up";
          setRepCount((prev) => prev + 1);
        }
      }

      if (rightElbowAngle !== null) {
        if (rightElbowAngle > CURL_DOWN_ANGLE && rightPhase.current === "up") {
          rightPhase.current = "down";
        } else if (rightElbowAngle < CURL_UP_ANGLE && rightPhase.current === "down") {
          rightPhase.current = "up";
          setRepCount((prev) => prev + 1);
        }
      }

      // ── Form feedback (throttled to every 1.5s) ───────────────────────────
      if (now - lastFeedbackTime.current < 1500) return;
      lastFeedbackTime.current = now;

      // 1. Check for elbow flare — elbow should stay close to the body
      //    Elbow x should roughly align with shoulder x (small horizontal drift)
      if (leftVisible && lHip) {
        const elbowFlare = Math.abs(lElbow.x - lShoulder.x);
        if (elbowFlare > ELBOW_FLARE_THRESHOLD) {
          setFeedback({ message: "Keep your left elbow tucked in", type: "negative" });
          return;
        }
      }
      if (rightVisible && rHip) {
        const elbowFlare = Math.abs(rElbow.x - rShoulder.x);
        if (elbowFlare > ELBOW_FLARE_THRESHOLD) {
          setFeedback({ message: "Keep your right elbow tucked in", type: "negative" });
          return;
        }
      }

      // 2. Check for wrist deviation — wrist should stay aligned with elbow
      //    Prevents wrist curling or excessive deviation
      if (leftVisible) {
        const wristDeviation = Math.abs(lWrist.x - lElbow.x);
        if (wristDeviation > WRIST_DEVIATION_THRESHOLD) {
          setFeedback({ message: "Straighten your left wrist", type: "negative" });
          return;
        }
      }
      if (rightVisible) {
        const wristDeviation = Math.abs(rWrist.x - rElbow.x);
        if (wristDeviation > WRIST_DEVIATION_THRESHOLD) {
          setFeedback({ message: "Straighten your right wrist", type: "negative" });
          return;
        }
      }

      // 3. Check for shoulder shrugging — shoulder should not rise toward ear
      //    Compare shoulder y to hip y — if shoulder rises significantly, flag it
      if (leftVisible && lHip) {
        const shoulderRise = lHip.y - lShoulder.y;
        // In normalized coords, y increases downward. If shoulder y is too high
        // (small y value) relative to hip, the shoulder is shrugging.
        if (shoulderRise < 0.25) {
          setFeedback({ message: "Don't shrug — keep shoulders down", type: "negative" });
          return;
        }
      }

      // 4. Check range of motion — is the user curling fully?
      const activeAngle = leftElbowAngle ?? rightElbowAngle ?? 180;

      if (activeAngle > CURL_DOWN_ANGLE) {
        setFeedback({ message: "Start curling 💪", type: "neutral" });
      } else if (activeAngle < CURL_UP_ANGLE) {
        setFeedback({ message: "Full curl! Great range 🔥", type: "positive" });
      } else if (activeAngle > 100) {
        setFeedback({ message: "Curl higher for full range", type: "negative" });
      } else {
        setFeedback({ message: "Good form — keep going!", type: "positive" });
      }
    },
    []
  );

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let mounted = true;

    const loadMediaPipe = async () => {
      const waitForGlobal = (name: string, timeout = 10000): Promise<any> =>
        new Promise((resolve, reject) => {
          const start = Date.now();
          const check = () => {
            if ((window as any)[name]) resolve((window as any)[name]);
            else if (Date.now() - start > timeout) reject(new Error(`${name} not loaded`));
            else setTimeout(check, 100);
          };
          check();
        });

      try {
        const PoseClass = await waitForGlobal("Pose");
        const CameraClass = await waitForGlobal("Camera");

        const pose = new PoseClass({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        pose.onResults((results: PoseResults) => {
          if (!mounted) return;
          const w = canvas.width;
          const h = canvas.height;

          if (results.poseLandmarks) {
            drawSkeleton(results.poseLandmarks, ctx, w, h);
            analyzePose(results.poseLandmarks);
          } else {
            ctx.clearRect(0, 0, w, h);
          }
        });

        poseRef.current = pose;

        const camera = new CameraClass(video, {
          onFrame: async () => {
            await pose.send({ image: video });
          },
          width: 640,
          height: 480,
          facingMode: "user",
        });

        cameraRef.current = camera;
        await camera.start();

        if (mounted) setIsLoading(false);
      } catch (err) {
        console.error("MediaPipe load error:", err);
        if (mounted) {
          setFeedback({ message: "Camera access required", type: "negative" });
          setIsLoading(false);
        }
      }
    };

    loadMediaPipe();

    return () => {
      mounted = false;
      cameraRef.current?.stop();
      poseRef.current?.close();
    };
  }, [videoRef, canvasRef, drawSkeleton, analyzePose]);

  return { repCount, feedback, isLoading };
}