/** 파쇄 조각. 서류 캔버스의 일부(sx,sy,sw,sh)를 그대로 잘라 그린다. */
export interface Piece {
  img: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  w: number;
  h: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  /** 바닥(더미 표면)에 닿을 y */
  floor: number;
}

/** 오브젝트 풀: 매 프레임 할당을 피하고 동시 개수 상한을 둔다 */
export class PiecePool {
  readonly active: Piece[] = [];
  private free: Piece[] = [];

  /** 저사양 모드에서 낮춘다 (이미 떠 있는 조각은 그대로 둠) */
  constructor(public limit: number) {}

  get full() {
    return this.active.length >= this.limit;
  }

  spawn(init: Omit<Piece, never>): Piece | null {
    if (this.full) return null;
    const p = this.free.pop() ?? ({} as Piece);
    Object.assign(p, init);
    this.active.push(p);
    return p;
  }

  /** i번째 조각을 반납 (swap-remove) */
  release(i: number) {
    const p = this.active[i];
    const last = this.active.pop()!;
    if (i < this.active.length) this.active[i] = last;
    p.img = null as unknown as CanvasImageSource; // 서류 캔버스 참조 해제
    this.free.push(p);
  }

  clear() {
    while (this.active.length) this.release(this.active.length - 1);
  }
}
