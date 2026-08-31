export class RollingStats {
  private readonly samples: number[] = [];
  private readonly capacity: number;

  constructor(capacity = 240) {
    this.capacity = capacity;
  }

  push(value: number): void {
    this.samples.push(value);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  get count(): number {
    return this.samples.length;
  }

  mean(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((sum, v) => sum + v, 0) / this.samples.length;
  }

  p95(): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
    return sorted[Math.max(0, index)]!;
  }

  reset(): void {
    this.samples.length = 0;
  }
}
