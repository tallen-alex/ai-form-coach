import { useEffect, useState } from "react";

const BicepCurlAnimation = () => {
  const [phase, setPhase] = useState(0); // 0 = down, 100 = up

  useEffect(() => {
    let direction = 1;
    let current = 0;
    const interval = setInterval(() => {
      current += direction * 1.2;
      if (current >= 100) { current = 100; direction = -1; }
      if (current <= 0) { current = 0; direction = 1; }
      setPhase(current);
    }, 16);
    return () => clearInterval(interval);
  }, []);

  // Eased phase for smooth motion
  const t = phase / 100;
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  // Side-view figure geometry
  const headCx = 150;
  const headCy = 60;
  const shoulderX = 150;
  const shoulderY = 100;
  const hipX = 150;
  const hipY = 210;
  const kneeX = 150;
  const kneeY = 290;
  const ankleX = 150;
  const ankleY = 365;

  // Upper arm stays vertical, pinned at shoulder
  const elbowX = shoulderX;
  const elbowY = shoulderY + 55;

  // Forearm curls up: angle from straight down (0) to fully curled (~140deg)
  const forearmAngle = eased * 140 * (Math.PI / 180);
  const forearmLen = 50;
  const wristX = elbowX + Math.sin(forearmAngle) * forearmLen;
  const wristY = elbowY + Math.cos(forearmAngle) * forearmLen;

  // Slight shoulder lift warning: shoulder stays down
  const shoulderOffsetY = eased * 1; // minimal

  const strokeColor = "hsl(145, 72%, 50%)";
  const jointColor = "hsl(145, 72%, 60%)";
  const guideColor = "hsl(220, 10%, 35%)";

  return (
    <svg viewBox="0 0 300 400" className="w-full max-w-[260px] h-auto">
      {/* Guide lines */}
      <line x1={shoulderX} y1={shoulderY} x2={shoulderX} y2={hipY} stroke={guideColor} strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />

      {/* Torso */}
      <line x1={shoulderX} y1={shoulderY - shoulderOffsetY} x2={hipX} y2={hipY} stroke={strokeColor} strokeWidth="4" strokeLinecap="round" />

      {/* Head */}
      <circle cx={headCx} cy={headCy} r="20" fill="none" stroke={strokeColor} strokeWidth="3" />
      {/* Neck */}
      <line x1={headCx} y1={headCy + 20} x2={shoulderX} y2={shoulderY - shoulderOffsetY} stroke={strokeColor} strokeWidth="3" strokeLinecap="round" />

      {/* Upper leg */}
      <line x1={hipX} y1={hipY} x2={kneeX} y2={kneeY} stroke={strokeColor} strokeWidth="4" strokeLinecap="round" />
      {/* Lower leg */}
      <line x1={kneeX} y1={kneeY} x2={ankleX} y2={ankleY} stroke={strokeColor} strokeWidth="4" strokeLinecap="round" />
      {/* Foot */}
      <line x1={ankleX} y1={ankleY} x2={ankleX + 18} y2={ankleY} stroke={strokeColor} strokeWidth="4" strokeLinecap="round" />

      {/* Upper arm (pinned, vertical) */}
      <line
        x1={shoulderX}
        y1={shoulderY - shoulderOffsetY}
        x2={elbowX}
        y2={elbowY}
        stroke={strokeColor}
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Forearm */}
      <line
        x1={elbowX}
        y1={elbowY}
        x2={wristX}
        y2={wristY}
        stroke={strokeColor}
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Dumbbell at wrist */}
      <rect
        x={wristX - 4}
        y={wristY - 8}
        width="8"
        height="16"
        rx="2"
        fill={strokeColor}
        opacity="0.8"
        transform={`rotate(${-forearmAngle * (180 / Math.PI)}, ${wristX}, ${wristY})`}
      />

      {/* Joints */}
      <circle cx={shoulderX} cy={shoulderY - shoulderOffsetY} r="5" fill={jointColor} />
      <circle cx={elbowX} cy={elbowY} r="5" fill={jointColor} />
      <circle cx={wristX} cy={wristY} r="4" fill={jointColor} />
      <circle cx={hipX} cy={hipY} r="5" fill={jointColor} />
      <circle cx={kneeX} cy={kneeY} r="4" fill={jointColor} />
      <circle cx={ankleX} cy={ankleY} r="4" fill={jointColor} />

      {/* Elbow pin indicator */}
      {eased > 0.2 && (
        <circle cx={elbowX} cy={elbowY} r="10" fill="none" stroke={jointColor} strokeWidth="1.5" opacity={0.4 + eased * 0.3}>
          <animate attributeName="r" values="8;12;8" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
};

export default BicepCurlAnimation;
