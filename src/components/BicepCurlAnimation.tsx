import { useEffect, useState } from "react";

const BicepCurlAnimation = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    let direction = 1;
    let current = 0;
    const interval = setInterval(() => {
      current += direction * 0.8;
      if (current >= 100) { current = 100; direction = -1; }
      if (current <= 0) { current = 0; direction = 1; }
      setPhase(current);
    }, 16);
    return () => clearInterval(interval);
  }, []);

  const t = phase / 100;
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  // Key points
  const shoulderX = 152;
  const shoulderY = 115;
  const elbowX = 152;
  const elbowY = 178;
  const forearmAngle = eased * 135 * (Math.PI / 180);
  const forearmLen = 52;
  const wristX = elbowX + Math.sin(forearmAngle) * forearmLen;
  const wristY = elbowY + Math.cos(forearmAngle) * forearmLen;

  const bicepBulge = 4 + eased * 7;

  const skin = "hsl(145, 50%, 55%)";
  const skinDark = "hsl(145, 45%, 40%)";
  const skinLight = "hsl(145, 55%, 65%)";
  const outline = "hsl(145, 60%, 35%)";
  const metal = "hsl(220, 10%, 50%)";
  const metalDark = "hsl(220, 10%, 35%)";

  const fDx = wristX - elbowX;
  const fDy = wristY - elbowY;
  const fLen = Math.sqrt(fDx * fDx + fDy * fDy);
  const fNx = -fDy / fLen;
  const fNy = fDx / fLen;

  const uNx = -1;

  // Leg geometry — proper anatomical side-view
  const hipX = 150;
  const hipY = 260;
  const kneeY = 330;
  const ankleY = 392;

  return (
    <svg viewBox="0 0 300 420" className="w-full max-w-[280px] h-auto">
      <defs>
        <radialGradient id="headGrad" cx="45%" cy="40%">
          <stop offset="0%" stopColor={skinLight} />
          <stop offset="100%" stopColor={skin} />
        </radialGradient>
        <linearGradient id="torsoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={skinLight} stopOpacity="0.9" />
          <stop offset="100%" stopColor={skinDark} stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {/* ===== LEGS (proper shaped) ===== */}
      {/* Back leg */}
      <path
        d={`M ${hipX - 5},${hipY}
            Q ${hipX - 8},${hipY + 20} ${hipX - 6},${kneeY - 15}
            Q ${hipX - 4},${kneeY} ${hipX - 5},${kneeY + 5}
            Q ${hipX - 7},${kneeY + 25} ${hipX - 5},${ankleY - 5}
            L ${hipX - 5},${ankleY}`}
        fill="none" stroke={skinDark} strokeWidth="20" strokeLinecap="round"
        opacity="0.7"
      />
      {/* Back foot */}
      <path
        d={`M ${hipX - 5},${ankleY} L ${hipX - 18},${ankleY + 4} Q ${hipX - 20},${ankleY + 6} ${hipX - 16},${ankleY + 6} L ${hipX + 2},${ankleY + 3}`}
        fill={skinDark} stroke={outline} strokeWidth="0.8" opacity="0.7"
      />

      {/* Front leg — thigh */}
      <path
        d={`M ${hipX + 8},${hipY - 5}
            C ${hipX + 14},${hipY + 15} ${hipX + 14},${hipY + 35} ${hipX + 10},${kneeY - 10}
            L ${hipX - 2},${kneeY - 10}
            C ${hipX - 4},${hipY + 35} ${hipX - 2},${hipY + 15} ${hipX - 6},${hipY - 5}
            Z`}
        fill={skin} stroke={outline} strokeWidth="1.2"
      />
      {/* Quad definition */}
      <path
        d={`M ${hipX + 4},${hipY + 10} Q ${hipX + 6},${hipY + 35} ${hipX + 5},${kneeY - 18}`}
        fill="none" stroke={skinLight} strokeWidth="1.5" opacity="0.3"
      />

      {/* Front leg — knee */}
      <ellipse cx={hipX + 4} cy={kneeY - 5} rx="11" ry="8" fill={skin} stroke={outline} strokeWidth="1" />
      <ellipse cx={hipX + 5} cy={kneeY - 5} rx="5" ry="4" fill={skinLight} opacity="0.25" />

      {/* Front leg — calf */}
      <path
        d={`M ${hipX + 10},${kneeY}
            C ${hipX + 12},${kneeY + 18} ${hipX + 10},${kneeY + 40} ${hipX + 5},${ankleY - 5}
            L ${hipX - 2},${ankleY - 5}
            C ${hipX - 5},${kneeY + 40} ${hipX - 4},${kneeY + 18} ${hipX - 2},${kneeY}
            Z`}
        fill={skin} stroke={outline} strokeWidth="1.2"
      />
      {/* Calf muscle definition */}
      <path
        d={`M ${hipX + 7},${kneeY + 8} Q ${hipX + 9},${kneeY + 25} ${hipX + 5},${kneeY + 40}`}
        fill="none" stroke={skinLight} strokeWidth="1.5" opacity="0.3"
      />

      {/* Front foot */}
      <path
        d={`M ${hipX + 6},${ankleY - 5}
            Q ${hipX + 5},${ankleY + 1} ${hipX + 20},${ankleY + 4}
            Q ${hipX + 22},${ankleY + 6} ${hipX + 18},${ankleY + 6}
            L ${hipX - 6},${ankleY + 3}
            Q ${hipX - 4},${ankleY - 1} ${hipX - 2},${ankleY - 5}
            Z`}
        fill={skin} stroke={outline} strokeWidth="1"
      />

      {/* ===== TORSO (wider, more muscular) ===== */}
      <path
        d={`M ${shoulderX - 20},${shoulderY + 2}
            Q ${shoulderX - 24},${shoulderY + 30} ${shoulderX - 20},${shoulderY + 60}
            Q ${shoulderX - 18},${hipY - 20} ${shoulderX - 10},${hipY - 5}
            Q ${shoulderX},${hipY + 2} ${shoulderX + 10},${hipY - 5}
            Q ${shoulderX + 18},${hipY - 20} ${shoulderX + 20},${shoulderY + 60}
            Q ${shoulderX + 24},${shoulderY + 30} ${shoulderX + 20},${shoulderY + 2}
            Z`}
        fill="url(#torsoGrad)" stroke={outline} strokeWidth="1.5"
      />
      {/* Lat flare */}
      <path
        d={`M ${shoulderX - 18},${shoulderY + 20} Q ${shoulderX - 22},${shoulderY + 55} ${shoulderX - 14},${hipY - 15}`}
        fill="none" stroke={outline} strokeWidth="1" opacity="0.25"
      />
      {/* Chest/pec */}
      <path
        d={`M ${shoulderX - 12},${shoulderY + 12} Q ${shoulderX},${shoulderY + 25} ${shoulderX + 12},${shoulderY + 12}`}
        fill="none" stroke={outline} strokeWidth="1.2" opacity="0.35"
      />
      {/* Ab center line */}
      <line x1={shoulderX} y1={shoulderY + 55} x2={shoulderX} y2={hipY - 10} stroke={outline} strokeWidth="0.8" opacity="0.2" />
      {/* Ab rows */}
      <path d={`M ${shoulderX - 10},${shoulderY + 70} Q ${shoulderX},${shoulderY + 73} ${shoulderX + 10},${shoulderY + 70}`} fill="none" stroke={outline} strokeWidth="0.8" opacity="0.25" />
      <path d={`M ${shoulderX - 9},${shoulderY + 90} Q ${shoulderX},${shoulderY + 93} ${shoulderX + 9},${shoulderY + 90}`} fill="none" stroke={outline} strokeWidth="0.8" opacity="0.25" />
      <path d={`M ${shoulderX - 8},${shoulderY + 110} Q ${shoulderX},${shoulderY + 113} ${shoulderX + 8},${shoulderY + 110}`} fill="none" stroke={outline} strokeWidth="0.8" opacity="0.25" />
      {/* Oblique */}
      <path d={`M ${shoulderX + 16},${shoulderY + 50} Q ${shoulderX + 12},${shoulderY + 80} ${shoulderX + 10},${hipY - 10}`} fill="none" stroke={outline} strokeWidth="0.7" opacity="0.2" />
      <path d={`M ${shoulderX - 16},${shoulderY + 50} Q ${shoulderX - 12},${shoulderY + 80} ${shoulderX - 10},${hipY - 10}`} fill="none" stroke={outline} strokeWidth="0.7" opacity="0.2" />

      {/* ===== REAR SHOULDER ===== */}
      <ellipse cx={shoulderX + 3} cy={shoulderY} rx="18" ry="15" fill={skinDark} stroke={outline} strokeWidth="1" />

      {/* ===== WORKING ARM ===== */}
      {/* Upper arm with bigger bicep bulge */}
      <path
        d={`M ${shoulderX - 10},${shoulderY + 6}
            Q ${shoulderX - 11 + uNx * bicepBulge},${(shoulderY + elbowY) / 2}
              ${elbowX - 9},${elbowY - 2}
            L ${elbowX + 9},${elbowY - 2}
            Q ${shoulderX + 9},${(shoulderY + elbowY) / 2}
              ${shoulderX + 10},${shoulderY + 6}
            Z`}
        fill={skin} stroke={outline} strokeWidth="1.2"
      />
      {/* Tricep line */}
      <path
        d={`M ${shoulderX + 8},${shoulderY + 14}
            Q ${shoulderX + 10},${(shoulderY + elbowY) / 2}
              ${elbowX + 7},${elbowY - 10}`}
        fill="none" stroke={outline} strokeWidth="0.8" opacity="0.25"
      />
      {/* Bicep highlight */}
      <path
        d={`M ${shoulderX - 8},${shoulderY + 14}
            Q ${shoulderX - 9 + uNx * (bicepBulge * 0.7)},${(shoulderY + elbowY) / 2}
              ${elbowX - 6},${elbowY - 10}`}
        fill="none" stroke={skinLight} strokeWidth="2.5" opacity={0.3 + eased * 0.5} strokeLinecap="round"
      />

      {/* Forearm (thicker) */}
      <path
        d={`M ${elbowX - 8},${elbowY}
            Q ${elbowX + fNx * 3},${elbowY + fNy * 3}
              ${wristX - fNx * 5},${wristY - fNy * 5}
            L ${wristX + fNx * 5},${wristY + fNy * 5}
            Q ${elbowX - fNx * 3},${elbowY - fNy * 3}
              ${elbowX + 8},${elbowY}
            Z`}
        fill={skin} stroke={outline} strokeWidth="1.2"
      />
      {/* Forearm muscle line */}
      <path
        d={`M ${elbowX + fNx * 1 - 3},${elbowY + fNy * 1 + 5}
            L ${wristX + fNx * 1},${wristY + fNy * 1 - 5}`}
        fill="none" stroke={outline} strokeWidth="0.7" opacity="0.2"
      />

      {/* Elbow joint */}
      <circle cx={elbowX} cy={elbowY} r="8" fill={skinDark} stroke={outline} strokeWidth="1" />

      {/* Front shoulder (deltoid — bigger) */}
      <ellipse cx={shoulderX} cy={shoulderY - 2} rx="20" ry="16" fill={skin} stroke={outline} strokeWidth="1.2" />
      {/* Delt striations */}
      <path
        d={`M ${shoulderX - 6},${shoulderY - 12} Q ${shoulderX - 3},${shoulderY + 2} ${shoulderX - 5},${shoulderY + 12}`}
        fill="none" stroke={outline} strokeWidth="0.8" opacity="0.3"
      />
      <path
        d={`M ${shoulderX + 3},${shoulderY - 12} Q ${shoulderX + 5},${shoulderY} ${shoulderX + 3},${shoulderY + 10}`}
        fill="none" stroke={outline} strokeWidth="0.6" opacity="0.2"
      />

      {/* ===== WRIST & DUMBBELL ===== */}
      <circle cx={wristX} cy={wristY} r="5" fill={skinDark} />

      {(() => {
        const angle = -forearmAngle * (180 / Math.PI);
        return (
          <g transform={`rotate(${angle}, ${wristX}, ${wristY})`}>
            <rect x={wristX - 2.5} y={wristY - 18} width="5" height="36" rx="2" fill={metal} />
            <rect x={wristX - 8} y={wristY - 20} width="16" height="6" rx="2" fill={metalDark} stroke={metal} strokeWidth="0.5" />
            <rect x={wristX - 8} y={wristY + 14} width="16" height="6" rx="2" fill={metalDark} stroke={metal} strokeWidth="0.5" />
          </g>
        );
      })()}

      {/* ===== HEAD ===== */}
      {/* Neck (thicker, traps) */}
      <path
        d={`M ${shoulderX - 8},${shoulderY - 10}
            Q ${shoulderX - 6},${shoulderY - 25} ${shoulderX - 4},${shoulderY - 30}
            L ${shoulderX + 6},${shoulderY - 30}
            Q ${shoulderX + 8},${shoulderY - 25} ${shoulderX + 10},${shoulderY - 10}`}
        fill={skin} stroke={outline} strokeWidth="1"
      />
      {/* Trap muscle visible from side */}
      <path
        d={`M ${shoulderX - 16},${shoulderY + 2} Q ${shoulderX},${shoulderY - 20} ${shoulderX + 16},${shoulderY + 2}`}
        fill={skinDark} opacity="0.35"
      />

      {/* Head */}
      <ellipse cx={shoulderX + 1} cy={shoulderY - 48} rx="17" ry="21" fill="url(#headGrad)" stroke={outline} strokeWidth="1.2" />
      {/* Hair/cap */}
      <path
        d={`M ${shoulderX - 16},${shoulderY - 52} Q ${shoulderX - 14},${shoulderY - 72} ${shoulderX + 1},${shoulderY - 72} Q ${shoulderX + 16},${shoulderY - 72} ${shoulderX + 18},${shoulderY - 52}`}
        fill={skinDark} stroke={outline} strokeWidth="0.8"
      />
      {/* Ear */}
      <ellipse cx={shoulderX + 17} cy={shoulderY - 48} rx="4" ry="6" fill={skinDark} stroke={outline} strokeWidth="0.8" />
      {/* Eye */}
      <circle cx={shoulderX + 10} cy={shoulderY - 51} r="2" fill={outline} />
      {/* Jaw */}
      <path
        d={`M ${shoulderX + 10},${shoulderY - 34} Q ${shoulderX + 5},${shoulderY - 28} ${shoulderX - 2},${shoulderY - 30}`}
        fill="none" stroke={outline} strokeWidth="0.8" opacity="0.3"
      />
    </svg>
  );
};

export default BicepCurlAnimation;
