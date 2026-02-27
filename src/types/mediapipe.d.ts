// Type declarations for MediaPipe CDN globals
declare class Pose {
  constructor(config: { locateFile: (file: string) => string });
  setOptions(options: Record<string, unknown>): void;
  onResults(callback: (results: any) => void): void;
  send(input: { image: HTMLVideoElement }): Promise<void>;
  close(): void;
}

declare const POSE_CONNECTIONS: Array<[number, number]>;

declare class Camera {
  constructor(
    video: HTMLVideoElement,
    config: {
      onFrame: () => Promise<void>;
      width?: number;
      height?: number;
    }
  );
  start(): void;
  stop(): void;
}

declare function drawConnectors(
  ctx: CanvasRenderingContext2D,
  landmarks: any[],
  connections: Array<[number, number]>,
  style: Record<string, unknown>
): void;

declare function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: any[],
  style: Record<string, unknown>
): void;
