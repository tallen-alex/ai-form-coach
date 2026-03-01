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
  const shoulderY = 118;
  const elbowX = 152;
  const elbowY = 178;
  const forearmAngle = eased * 135 * (Math.PI / 180);
  const forearmLen = 52;
  const wristX = elbowX + Math.sin(forearmAngle) * forearmLen;
  const wristY = elbowY + Math.cos(forearmAngle) * forearmLen;

  // Bicep bulge increases with curl
  const bicepBulge = 3 + eased * 5;

  // Primary color
  const skin = "hsl(145, 50%, 55%)";
  const skinDark = "hsl(145, 45%, 40%)";
  const skinLight = "hsl(145, 55%, 65%)";
  const outline = "hsl(145, 60%, 35%)";
  const metal = "hsl(220, 10%, 50%)";
  const metalDark = "hsl(220, 10%, 35%)";

  // Forearm direction vector (normalized)
  const fDx = wristX - elbowX;
  const fDy = wristY - elbowY;
  const fLen = Math.sqrt(fDx * fDx + fDy * fDy);
  const fNx = -fDy / fLen; // perpendicular
  const fNy = fDx / fLen;

  // Upper arm perpendicular for bicep bulge
  const uNx = -1; // bulge outward (left side since side-on)

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
        <linearGradient id="legGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skin} />
          <stop offset="100%" stopColor={skinDark} />
        </linearGradient>
      </defs>

      {/* ===== LEGS ===== */}
      {/* Back leg (slightly behind) */}
      <path
        d={`M 143,258 Q 141,300 143,340 Q 144,360 140,380`}
        fill="none" stroke={skinDark} strokeWidth="18" strokeLinecap="round"
      />
      <path
        d={`M 140,380 L 128,382`}
        fill="none" stroke={skinDark} strokeWidth="10" strokeLinecap="round"
      />
      {/* Front leg */}
      <path
        d={`M 155,258 Q 157,300 155,340 Q 154,360 158,380`}
        fill="none" stroke={skin} strokeWidth="20" strokeLinecap="round"
      />
      <path
        d={`M 158,380 L 172,382`}
        fill="none" stroke={skin} strokeWidth="11" strokeLinecap="round"
      />
      {/* Knee caps */}
      <ellipse cx="155" cy="318" rx="8" ry="5" fill={skinLight} opacity="0.3" />

      {/* ===== TORSO ===== */}
      <path
        d={`M 135,118 
            Q 130,140 132,170 
            Q 133,200 135,230 
            Q 138,255 150,262 
            Q 162,255 165,230 
            Q 167,200 168,170 
            Q 170,140 165,118 
            Z`}
        fill="url(#torsoGrad)" stroke={outline} strokeWidth="1.5"
      />
      {/* Chest/pec line */}
      <path
        d={`M 142,132 Q 150,140 158,132`}
        fill="none" stroke={outline} strokeWidth="1" opacity="0.4"
      />
      {/* Ab lines */}
      <line x1="150" y1="175" x2="150" y2="245" stroke={outline} strokeWidth="0.8" opacity="0.2" />
      <path d="M 142,190 Q 150,193 158,190" fill="none" stroke={outline} strokeWidth="0.7" opacity="0.2" />
      <path d="M 143,210 Q 150,213 157,210" fill="none" stroke={outline} strokeWidth="0.7" opacity="0.2" />
      <path d="M 144,230 Q 150,233 156,230" fill="none" stroke={outline} strokeWidth="0.7" opacity="0.2" />

      {/* ===== REAR SHOULDER ===== */}
      <ellipse cx={shoulderX + 2} cy={shoulderY} rx="16" ry="13" fill={skinDark} stroke={outline} strokeWidth="1" />

      {/* ===== WORKING ARM (front) ===== */}
      {/* Upper arm with bicep bulge */}
      <path
        d={`M ${shoulderX - 8},${shoulderY + 4}
            Q ${shoulderX - 9 + uNx * bicepBulge},${(shoulderY + elbowY) / 2}
              ${elbowX - 8},${elbowY - 2}
            L ${elbowX + 8},${elbowY - 2}
            Q ${shoulderX + 7},${(shoulderY + elbowY) / 2}
              ${shoulderX + 8},${shoulderY + 4}
            Z`}
        fill={skin} stroke={outline} strokeWidth="1.2"
      />
      {/* Bicep highlight */}
      <path
        d={`M ${shoulderX - 6},${shoulderY + 12}
            Q ${shoulderX - 7 + uNx * (bicepBulge * 0.7)},${(shoulderY + elbowY) / 2}
              ${elbowX - 5},${elbowY - 8}`}
        fill="none" stroke={skinLight} strokeWidth="2" opacity={0.3 + eased * 0.4} strokeLinecap="round"
      />

      {/* Forearm */}
      <path
        d={`M ${elbowX - 7},${elbowY}
            Q ${elbowX + fNx * 2},${elbowY + fNy * 2}
              ${wristX - fNx * 5},${wristY - fNy * 5}
            L ${wristX + fNx * 5},${wristY + fNy * 5}
            Q ${elbowX - fNx * 2},${elbowY - fNy * 2}
              ${elbowX + 7},${elbowY}
            Z`}
        fill={skin} stroke={outline} strokeWidth="1.2"
      />

      {/* Elbow joint */}
      <circle cx={elbowX} cy={elbowY} r="7" fill={skinDark} stroke={outline} strokeWidth="1" />

      {/* Front shoulder (deltoid cap) */}
      <ellipse cx={shoulderX} cy={shoulderY - 2} rx="17" ry="14" fill={skin} stroke={outline} strokeWidth="1.2" />
      {/* Delt striation */}
      <path
        d={`M ${shoulderX - 5},${shoulderY - 10} Q ${shoulderX - 2},${shoulderY + 2} ${shoulderX - 4},${shoulderY + 10}`}
        fill="none" stroke={outline} strokeWidth="0.7" opacity="0.3"
      />

      {/* ===== WRIST & DUMBBELL ===== */}
      {/* Wrist */}
      <circle cx={wristX} cy={wristY} r="5" fill={skinDark} />

      {/* Dumbbell */}
      {(() => {
        const angle = -forearmAngle * (180 / Math.PI);
        return (
          <g transform={`rotate(${angle}, ${wristX}, ${wristY})`}>
            {/* Bar */}
            <rect x={wristX - 2.5} y={wristY - 16} width="5" height="32" rx="2" fill={metal} />
            {/* Plates */}
            <rect x={wristX - 7} y={wristY - 18} width="14" height="5" rx="1.5" fill={metalDark} stroke={metal} strokeWidth="0.5" />
            <rect x={wristX - 7} y={wristY + 13} width="14" height="5" rx="1.5" fill={metalDark} stroke={metal} strokeWidth="0.5" />
          </g>
        );
      })()}

      {/* ===== HEAD ===== */}
      {/* Neck */}
      <rect x="144" y="88" width="14" height="18" rx="5" fill={skin} />
      {/* Trap muscle */}
      <path d="M 138,105 Q 150,95 162,105" fill={skinDark} opacity="0.4" />
      {/* Head */}
      <ellipse cx="151" cy="72" rx="18" ry="22" fill="url(#headGrad)" stroke={outline} strokeWidth="1.2" />
      {/* Hair/cap */}
      <path
        d={`M 133,68 Q 135,48 151,46 Q 167,48 169,68`}
        fill={skinDark} stroke={outline} strokeWidth="0.8"
      />
      {/* Ear */}
      <ellipse cx="168" cy="72" rx="4" ry="6" fill={skinDark} stroke={outline} strokeWidth="0.8" />
      {/* Eye */}
      <circle cx="161" cy="69" r="2" fill={outline} />
      {/* Jaw line */}
      <path d="M 160,85 Q 155,92 148,90" fill="none" stroke={outline} strokeWidth="0.8" opacity="0.3" />
    </svg>
  );
};

export default BicepCurlAnimation;
