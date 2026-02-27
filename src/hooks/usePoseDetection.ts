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

  const stateRef = useRef<"up" | "down">("up");
  const animFrameRef = useRef<number | null>(null);
  const poseRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  const resetState = useCallback(() => {
    setReps(0);
    setFeedback("Position yourself in frame");
    setFeedbackType("neutral");
    setIsDetecting(false);
    stateRef.current = "up";
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
          const avgAngle = (leftAngle + rightAngle) / 2;

          if (avgAngle < 60 && stateRef.current === "up") {
            stateRef.current = "down";
          } else if (avgAngle > 140 && stateRef.current === "down") {
            stateRef.current = "up";
            setReps((prev) => prev + 1);
          }

          const angleDiff = Math.abs(leftAngle - rightAngle);
          if (angleDiff > 30) {
            setFeedback("Keep both arms even");
            setFeedbackType("negative");
          } else if (avgAngle < 60) {
            setFeedback("Great squeeze!");
            setFeedbackType("positive");
          } else if (avgAngle > 140) {
            setFeedback("Full extension — nice!");
            setFeedbackType("positive");
          } else {
            setFeedback("Keep curling!");
            setFeedbackType("neutral");
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
