import type { GameEvent } from "./engine";
import type { Settings } from "./settings";

/**
 * 음원 파일 없이 Web Audio로 합성하는 효과음.
 * 모바일 정책상 첫 사용자 입력 이후에만 AudioContext를 만들고 resume 한다.
 */
export class SoundBoard {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private motorBus!: GainNode;
  private noise!: AudioBuffer;
  private motor: { osc: OscillatorNode; sub: OscillatorNode; chew: AudioBufferSourceNode; out: GainNode } | null = null;
  private settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  /** 첫 pointerdown/keydown 에서 호출 */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.motorBus = ctx.createGain();
      this.motorBus.connect(this.master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.applySettings(this.settings);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  applySettings(s: Settings) {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : 0.8, t, 0.02);
    this.sfx.gain.setTargetAtTime(s.sfxVolume, t, 0.02);
    this.motorBus.gain.setTargetAtTime(s.motorVolume, t, 0.02);
  }

  private get ready() {
    return this.ctx && this.ctx.state === "running" && !this.settings.muted;
  }

  handleEvent(e: GameEvent, speedFactor: number) {
    switch (e.type) {
      case "shredStart":
        this.motorStart(speedFactor, e.duration);
        break;
      case "shredDone":
        this.motorStop();
        this.coin(e.docs.some((d) => d.rarity !== null));
        break;
      case "arrive":
        this.paperSlide();
        break;
      case "buy":
      case "buyBags":
        this.purchase();
        break;
      case "overheat":
        this.overheatBeeps();
        this.fanStart();
        break;
      case "cooled":
        this.fanStop();
        this.chime();
        break;
      case "earlyRestart":
        this.fanStop();
        this.click();
        break;
      case "fanTap":
        if (this.ready) this.noiseBurst(this.ctx!.currentTime, 0.12, 700, 0.06);
        break;
      case "binWarn":
        this.chime();
        break;
      case "binFull":
        this.error();
        break;
      case "emptyStep":
        if (e.step === "tie" || e.step === "carry" || e.step === "replace") this.rustle();
        break;
      case "tieTap":
        this.click();
        break;
      case "bagBurst":
        this.thud();
        this.rustle();
        break;
      case "sweep":
        if (this.ready) this.noiseBurst(this.ctx!.currentTime, 0.14, 4200, 0.05);
        break;
      case "binEmptied":
        if (e.reward > 0) this.coin(e.bonus);
        break;
      case "jam":
        this.motorStop(true);
        this.jamBuzz();
        break;
      case "reverse":
        if (e.on) this.reverseStart();
        else this.reverseStop();
        break;
      case "jamPull":
        this.reverseStop();
        if (e.pulled > 0) this.rustle();
        break;
      case "jamCleared":
        this.reverseStop();
        if (e.lost) this.thud();
        else this.motorStart(speedFactor, 3);
        break;
      case "hazardTreated":
        this.hazardSound(e.kind, e.done);
        break;
      case "hazardUnlocked":
      case "imageAdded":
        this.chime();
        break;
      case "actionFailed":
        this.error();
        break;
    }
  }

  // ---------- 모터 + 종이 먹는 소리 ----------
  private motorStart(speedFactor: number, duration: number) {
    if (!this.ready) return;
    this.motorStop(true);
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.32, t + 0.12);
    out.connect(this.motorBus);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    lp.connect(out);

    const pitch = 62 * speedFactor;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(pitch * 0.45, t);
    osc.frequency.exponentialRampToValueAtTime(pitch, t + 0.25);
    osc.connect(lp);

    const sub = ctx.createOscillator();
    sub.type = "square";
    sub.frequency.setValueAtTime(pitch * 0.5 * 1.01, t);
    const subGain = ctx.createGain();
    subGain.gain.value = 0.25;
    sub.connect(subGain).connect(lp);

    // 종이 먹는 소리: 대역 필터 노이즈를 저주파로 끊어 바스락거리게
    const chew = ctx.createBufferSource();
    chew.buffer = this.noise;
    chew.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 0.9;
    const chewGain = ctx.createGain();
    chewGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 11 * speedFactor;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.22;
    lfo.connect(lfoDepth).connect(chewGain.gain);
    chew.connect(bp).connect(chewGain).connect(out);

    osc.start(t);
    sub.start(t);
    chew.start(t + 0.08);
    lfo.start(t + 0.08);
    const end = t + duration + 1;
    lfo.stop(end);
    this.motor = { osc, sub, chew, out };
  }

  private motorStop(immediate = false) {
    const m = this.motor;
    if (!m || !this.ctx) return;
    this.motor = null;
    const t = this.ctx.currentTime;
    const tail = immediate ? 0.03 : 0.35;
    m.out.gain.cancelScheduledValues(t);
    m.out.gain.setValueAtTime(m.out.gain.value, t);
    m.out.gain.linearRampToValueAtTime(0, t + tail);
    m.osc.frequency.cancelScheduledValues(t);
    m.osc.frequency.setValueAtTime(m.osc.frequency.value, t);
    m.osc.frequency.exponentialRampToValueAtTime(Math.max(20, m.osc.frequency.value * 0.4), t + tail);
    m.osc.stop(t + tail + 0.05);
    m.sub.stop(t + tail + 0.05);
    m.chew.stop(t + 0.05);
  }

  // ---------- 짧은 효과음 ----------
  private tone(freq: number, start: number, len: number, type: OscillatorType, gain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + len);
    osc.connect(g).connect(this.sfx);
    osc.start(start);
    osc.stop(start + len + 0.02);
  }

  private noiseBurst(start: number, len: number, freq: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + len);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(start, Math.random() * 0.5);
    src.stop(start + len + 0.02);
  }

  coin(big = false) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime + 0.05;
    this.tone(988, t, 0.09, "sine", 0.18);
    this.tone(1319, t + 0.07, big ? 0.35 : 0.18, "sine", 0.18);
    if (big) this.tone(1760, t + 0.16, 0.35, "sine", 0.12);
  }

  paperSlide() {
    if (!this.ready) return;
    this.noiseBurst(this.ctx!.currentTime, 0.16, 3200, 0.05);
  }

  purchase() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(1800, t, 0.03, "square", 0.05);
    this.tone(660, t + 0.04, 0.1, "triangle", 0.15);
    this.tone(880, t + 0.11, 0.16, "triangle", 0.15);
  }

  click() {
    if (!this.ready) return;
    this.tone(1400, this.ctx!.currentTime, 0.03, "square", 0.04);
  }

  error() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(180, t, 0.12, "square", 0.08);
    this.tone(150, t + 0.13, 0.16, "square", 0.08);
  }

  // ---------- 과열 / 통 ----------
  private fan: { src: AudioBufferSourceNode; out: GainNode } | null = null;

  private fanStart() {
    if (!this.ready || this.fan) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 0.4);
    src.connect(lp).connect(out).connect(this.motorBus);
    src.start();
    this.fan = { src, out };
  }

  private fanStop() {
    const f = this.fan;
    if (!f || !this.ctx) return;
    this.fan = null;
    const t = this.ctx.currentTime;
    f.out.gain.setTargetAtTime(0, t, 0.15);
    f.src.stop(t + 0.8);
  }

  /** 삐-삐-삐 경고음 */
  private overheatBeeps() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 3; i++) this.tone(1560, t + i * 0.22, 0.12, "square", 0.07);
  }

  private chime() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(784, t, 0.14, "triangle", 0.12);
    this.tone(1047, t + 0.1, 0.2, "triangle", 0.12);
  }

  private rustle() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 4; i++) this.noiseBurst(t + i * 0.06, 0.1, 1800 + Math.random() * 2400, 0.05);
  }

  private thud() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(70, t, 0.3, "sine", 0.35);
    this.noiseBurst(t, 0.25, 400, 0.12);
  }

  // ---------- 잼 / 방해 요소 ----------
  private reverseNode: { osc: OscillatorNode; out: GainNode } | null = null;

  /** 낮은 버저 + 덜컹 */
  private jamBuzz() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(110, t, 0.35, "sawtooth", 0.12);
    this.tone(95, t + 0.38, 0.35, "sawtooth", 0.12);
    this.noiseBurst(t, 0.12, 300, 0.25);
    this.noiseBurst(t + 0.2, 0.1, 250, 0.2);
  }

  /** 역회전: 피치가 내려가는 윙 소리 (누르고 있는 동안) */
  private reverseStart() {
    if (!this.ready || this.reverseNode) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 1.5);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.25, t + 0.08);
    osc.connect(lp).connect(out).connect(this.motorBus);
    osc.start(t);
    this.reverseNode = { osc, out };
  }

  private reverseStop() {
    const r = this.reverseNode;
    if (!r || !this.ctx) return;
    this.reverseNode = null;
    const t = this.ctx.currentTime;
    r.out.gain.cancelScheduledValues(t);
    r.out.gain.setValueAtTime(r.out.gain.value, t);
    r.out.gain.linearRampToValueAtTime(0, t + 0.12);
    r.osc.stop(t + 0.15);
  }

  private hazardSound(kind: string, done: boolean) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    switch (kind) {
      case "crumple":
        this.rustle();
        break;
      case "clip":
        this.tone(2600, t, 0.08, "triangle", 0.08);
        this.tone(3400, t + 0.05, 0.12, "triangle", 0.06);
        break;
      case "staple":
        // 짧은 클릭 두 번
        this.tone(1900, t, 0.025, "square", 0.06);
        this.tone(1500, t + 0.06, 0.025, "square", 0.06);
        if (done) this.tone(3000, t + 0.1, 0.1, "triangle", 0.05);
        break;
      case "binder":
        this.noiseBurst(t, 0.05, 1200, 0.25);
        this.tone(600, t, 0.06, "square", 0.05);
        break;
      case "sleeve":
        this.noiseBurst(t, 0.25, 6500, 0.08);
        break;
    }
  }

  dispose() {
    this.reverseStop();
    this.fanStop();
    this.motorStop(true);
    void this.ctx?.close();
    this.ctx = null;
  }
}
