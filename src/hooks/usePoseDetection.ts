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
  canvasRef: React.RefObject<HTMLCanvasElement | null>
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
      // Analyze squat-like movement using hip-knee-ankle angle
      const lHip = landmarks[23];
      const lKnee = landmarks[25];
      const lAnkle = landmarks[27];
      const rHip = landmarks[24];
      const rKnee = landmarks[26];
      const rAnkle = landmarks[28];
      const lShoulder = landmarks[11];
      const rShoulder = landmarks[12];

      if (!lHip || !lKnee || !lAnkle || !rHip || !rKnee || !rAnkle) return;

      const leftKneeAngle = angleBetween(lHip, lKnee, lAnkle);
      const rightKneeAngle = angleBetween(rHip, rKnee, rAnkle);
      const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

      // Rep counting (squat detection)
      if (avgKneeAngle < 100 && posePhase.current === "up") {
        posePhase.current = "down";
      } else if (avgKneeAngle > 160 && posePhase.current === "down") {
        posePhase.current = "up";
        setRepCount((prev) => prev + 1);
      }

      // Feedback (throttled)
      if (now - lastFeedbackTime.current > 2000) {
        lastFeedbackTime.current = now;

        // Check shoulder alignment
        if (lShoulder && rShoulder) {
          const shoulderDiff = Math.abs(lShoulder.y - rShoulder.y);
          if (shoulderDiff > 0.05) {
            setFeedback({ message: "Keep shoulders level", type: "negative" });
            return;
          }
        }

        // Check knee angle symmetry
        const kneeDiff = Math.abs(leftKneeAngle - rightKneeAngle);
        if (kneeDiff > 15) {
          setFeedback({ message: "Even out your stance", type: "negative" });
          return;
        }

        if (avgKneeAngle < 100) {
          setFeedback({ message: "Full range of motion 💪", type: "positive" });
        } else if (avgKneeAngle > 120 && avgKneeAngle < 160) {
          setFeedback({ message: "Go deeper for full rep", type: "negative" });
        } else {
          setFeedback({ message: "Good form — keep going!", type: "positive" });
        }
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
      // Wait for MediaPipe scripts to load
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
