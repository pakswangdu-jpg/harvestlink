// A short, subtle two-tone chime for a new in-app notification — synthesized with the Web
// Audio API rather than an external sound file, so there's nothing to fetch/bundle. Kept
// deliberately quiet and brief (two ~90ms tones), matching the spec's "(optional)" / subtle
// framing rather than a loud alert sound.
export function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    [[880, now], [1175, now + 0.09]].forEach(([frequency, startTime]) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.08, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.13);
    });

    setTimeout(() => ctx.close().catch(() => {}), 400);
  } catch {
    // Audio isn't available/allowed (e.g. autoplay policy before any user gesture) — silently
    // skip, this is explicitly an optional nicety, never something to surface as an error.
  }
}
