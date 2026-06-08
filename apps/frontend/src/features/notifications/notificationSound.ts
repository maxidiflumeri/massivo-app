// "Ding" sutil de dos tonos vía WebAudio — sin necesidad de embeber un binario.
// El AudioContext se crea perezosamente y se resume en cada play (los browsers lo
// dejan sonar una vez que hubo interacción del usuario en la página).
let ctx: AudioContext | null = null;

export function playNotificationSound(): void {
  try {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    const tones = [
      { f: 880, t: 0 },
      { f: 1174.66, t: 0.12 },
    ];
    for (const { f, t } of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.14, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.2);
    }
  } catch {
    // no-op (audio bloqueado / no soportado)
  }
}
