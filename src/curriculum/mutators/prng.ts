export class SeededPRNG {
  private s: number;

  constructor(seed: number) {
    this.s = (seed | 0) || 12345;
  }

  public next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  public pick<T>(arr: T[]): T {
    if (!arr.length) throw new Error('Cannot pick from empty array');
    return arr[this.nextInt(0, arr.length - 1)];
  }

  public shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  public sample<T>(arr: T[], count: number): T[] {
    const shuffled = this.shuffle(arr);
    return shuffled.slice(0, Math.min(count, arr.length));
  }
}
