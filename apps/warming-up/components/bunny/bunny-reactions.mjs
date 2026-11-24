// Finite, gentle gestures. Every pose returns to the approved original silhouette.
// No reward, meal or health state is inferred by this decorative layer.
export const WARMING_REACTIONS = Object.freeze({
  wave: { duration: 1900, reply: '반가워요!' },
  cheer: { duration: 2400, reply: '함께라서 좋아요!' },
  curious: { duration: 2100, reply: '어떤 이야기를 나눌까요?' },
  bow: { duration: 1900, reply: '마음을 나눠 줘서 고마워요.' },
  rest: { duration: 2600, reply: '잠깐 쉬어 가도 좋아요.' },
});

const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const pulse = (t, start, peak, end) => smooth((t - start) / (peak - start)) * (1 - smooth((t - peak) / (end - peak)));

export function warmingReactionAt(action, elapsed) {
  const duration = WARMING_REACTIONS[action]?.duration ?? 0;
  const t = Math.max(0, elapsed);
  const rig = { lift: 0, arm: 0, lean: 0, bodyY: 0 };
  if (!duration || t <= 0 || t >= duration) return rig;
  const envelope = smooth(t / 300) * (1 - smooth((t - duration + 400) / 400));
  switch (action) {
    case 'wave':
      rig.arm = envelope * (-.42 + .15 * Math.sin(t / 170));
      break;
    case 'cheer':
      rig.lift = 21 * pulse(t, 250, 490, 730) + 14 * pulse(t, 960, 1180, 1400);
      rig.arm = -.52 * envelope;
      rig.lean = .025 * Math.sin(t / 170) * envelope;
      break;
    case 'curious':
      rig.lean = -.085 * pulse(t, 150, 650, 1250) + .06 * pulse(t, 1050, 1550, 2050);
      rig.arm = -.16 * envelope;
      break;
    case 'bow':
      rig.lean = -.06 * pulse(t, 200, 800, 1600);
      rig.bodyY = 8 * pulse(t, 200, 800, 1600);
      rig.arm = .09 * envelope;
      break;
    case 'rest':
      rig.lean = .045 * envelope;
      rig.bodyY = 3 * (1 - Math.cos(t / 650)) * envelope;
      break;
  }
  return rig;
}
