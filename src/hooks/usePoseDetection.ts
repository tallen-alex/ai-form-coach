import { useRef, useEffect, useState, useCallback } from "react";
import type { FeedbackType } from "@/components/FeedbackCard";

interface PoseDetectionResult {
  reps: number;
  feedback: string;
  feedbackType: FeedbackType;
  isDetecting: boolean;
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
  selectedExerciseId: string | null
): PoseDetectionResult {
  const [reps, setReps] = useState(0);
  const [feedback, setFeedback] = useState("Position yourself in frame");
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("neutral");
  const [isDetecting, setIsDetecting] = useState(false);

  const leftPhaseRef = useRef<"up" | "down">("up");
  const rightPhaseRef = useRef<"up" | "down">("up");
  const animFrameRef = useRef<number | null>(null);
  const poseRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const lastFeedbackTimeRef = useRef<number>(0);

  const resetState = useCallback(() => {
    setReps(0);
    setFeedback("Position yourself in frame");
    setFeedbackType("neutral");
    setIsDetecting(false);
    leftPhaseRef.current = "up";
    rightPhaseRef.current = "up";
    lastFeedbackTimeRef.current = 0;
  }, []);

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
      const { Pose, POSE_CONNECTIONS } = await import("@mediapipe/pose");
      const { Camera } = await import("@mediapipe/camera_utils");
      const { drawConnectors, drawLandmarks } = await import("@mediapipe/drawing_utils");

      if (cancelled) return;

      const pose = new Pose({
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
          drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
            color: "rgba(0, 255, 128, 0.4)",
            lineWidth: 2,
          });
          drawLandmarks(ctx, results.poseLandmarks, {
            color: "rgba(0, 255, 128, 0.8)",
            lineWidth: 1,
            radius: 3,
          });

          const lm = results.poseLandmarks;
          const leftAngle = angleBetween(lm[11], lm[13], lm[15]);
          const rightAngle = angleBetween(lm[12], lm[14], lm[16]);

          // Independent per-arm rep counting
          if (leftAngle < 60 && leftPhaseRef.current === "up") {
            leftPhaseRef.current = "down";
          } else if (leftAngle > 150 && leftPhaseRef.current === "down") {
            leftPhaseRef.current = "up";
            setReps((prev) => prev + 1);
          }

          if (rightAngle < 60 && rightPhaseRef.current === "up") {
            rightPhaseRef.current = "down";
          } else if (rightAngle > 150 && rightPhaseRef.current === "down") {
            rightPhaseRef.current = "up";
            setReps((prev) => prev + 1);
          }

          // Throttled feedback (1500ms)
          const now = Date.now();
          if (now - lastFeedbackTimeRef.current >= 1500) {
            let newFeedback = "";
            let newType: FeedbackType = "neutral";

            // Priority: elbow flare → wrist deviation → shoulder shrug → range of motion
            const lElbowFlare = Math.abs(lm[13].x - lm[11].x);
            const rElbowFlare = Math.abs(lm[14].x - lm[12].x);
            const lWristDev = Math.abs(lm[15].x - lm[13].x);
            const rWristDev = Math.abs(lm[16].x - lm[14].x);
            const lShoulderHipDist = Math.abs(lm[11].y - lm[23].y);
            const rShoulderHipDist = Math.abs(lm[12].y - lm[24].y);

            if (lElbowFlare > 0.08 || rElbowFlare > 0.08) {
              newFeedback = "Keep your elbow tucked in";
              newType = "negative";
            } else if (lWristDev > 0.06 || rWristDev > 0.06) {
              newFeedback = "Straighten your wrist";
              newType = "negative";
            } else if (lShoulderHipDist < 0.25 || rShoulderHipDist < 0.25) {
              newFeedback = "Don't shrug — keep shoulders down";
              newType = "negative";
            } else {
              const avgAngle = (leftAngle + rightAngle) / 2;
              if (avgAngle < 60) {
                newFeedback = "Great squeeze!";
                newType = "positive";
              } else if (avgAngle > 150) {
                newFeedback = "Full extension — nice!";
                newType = "positive";
              } else {
                newFeedback = "Keep curling!";
                newType = "neutral";
              }
            }

            setFeedback(newFeedback);
            setFeedbackType(newType);
            lastFeedbackTimeRef.current = now;
          }

          setIsDetecting(true);
        } else {
          setFeedback("Position yourself in frame");
          setFeedbackType("neutral");
          setIsDetecting(false);
        }
      });

      poseRef.current = pose;

      const camera = new Camera(video, {
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

  return { reps, feedback, feedbackType, isDetecting };
}
