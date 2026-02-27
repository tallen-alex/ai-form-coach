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

function angleBetween(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);
  const cosAngle = dot / (magAB * magCB + 1e-6);
  return Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
}

export function usePoseDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  exerciseId: string | null
) {
  const [repCount, setRepCount] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackState>({
    message: "Get into position",
    type: "neutral",
  });
  const [isLoading, setIsLoading] = useState(true);
  const posePhase = useRef<"up" | "down">("up");
  const lastFeedbackTime = useRef(0);
  const poseRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  const drawSkeleton = useCallback(
    (landmarks: Landmark[], ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);

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
      if (!exerciseId) return;
      const now = Date.now();

      if (exerciseId === "bicep-curl") {
        // Bicep curl: track elbow angle (shoulder-elbow-wrist)
        const lShoulder = landmarks[11];
        const lElbow = landmarks[13];
        const lWrist = landmarks[15];
        const rShoulder = landmarks[12];
        const rElbow = landmarks[14];
        const rWrist = landmarks[16];

        if (!lShoulder || !lElbow || !lWrist || !rShoulder || !rElbow || !rWrist) return;

        const leftElbowAngle = angleBetween(lShoulder, lElbow, lWrist);
        const rightElbowAngle = angleBetween(rShoulder, rElbow, rWrist);
        const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

        // Rep counting: curl down (angle < 60) then extend up (angle > 140)
        if (avgElbowAngle < 60 && posePhase.current === "up") {
          posePhase.current = "down";
        } else if (avgElbowAngle > 140 && posePhase.current === "down") {
          posePhase.current = "up";
          setRepCount((prev) => prev + 1);
        }

        // Feedback (throttled)
        if (now - lastFeedbackTime.current > 2000) {
          lastFeedbackTime.current = now;

          // Check elbow symmetry
          const elbowDiff = Math.abs(leftElbowAngle - rightElbowAngle);
          if (elbowDiff > 20) {
            setFeedback({ message: "Curl both arms evenly", type: "negative" });
            return;
          }

          // Check for swinging (shoulder movement)
          const shoulderDiff = Math.abs(lShoulder.y - rShoulder.y);
          if (shoulderDiff > 0.05) {
            setFeedback({ message: "Keep shoulders steady", type: "negative" });
            return;
          }

          if (avgElbowAngle < 60) {
            setFeedback({ message: "Full contraction 💪", type: "positive" });
          } else if (avgElbowAngle > 100 && avgElbowAngle < 140) {
            setFeedback({ message: "Curl higher for full rep", type: "negative" });
          } else {
            setFeedback({ message: "Good form — keep going!", type: "positive" });
          }
        }
      }
    },
    [exerciseId]
  );

  // Reset state when exercise changes
  useEffect(() => {
    setRepCount(0);
    setFeedback({ message: "Get into position", type: "neutral" });
    posePhase.current = "up";
    lastFeedbackTime.current = 0;
  }, [exerciseId]);

  // Camera + pose lifecycle: only run when exerciseId is set
  useEffect(() => {
    if (!exerciseId || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let mounted = true;
    setIsLoading(true);

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
      cameraRef.current = null;
      poseRef.current?.close();
      poseRef.current = null;
    };
  }, [exerciseId, videoRef, canvasRef, drawSkeleton, analyzePose]);

  return { repCount, feedback, isLoading };
}
