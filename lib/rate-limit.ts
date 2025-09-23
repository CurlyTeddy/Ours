interface Cooldown {
  lastVisit: number;
  penaltylIndex: number;
}

class Throttler<Key> {
  private bucket: Map<Key, Cooldown>;
  private intervals: number[];

  constructor(intervals: number[]) {
    this.bucket = new Map();
    this.intervals = intervals;
  }

  public consume(key: Key): number {
    const cooldown = this.bucket.get(key);
    const now = Date.now() / 1000;
    if (cooldown === undefined) {
      this.bucket.set(key, {
        lastVisit: now,
        penaltylIndex: 0,
      });

      return 0;
    }

    const releaseTime =
      cooldown.lastVisit + this.intervals[cooldown.penaltylIndex];
    if (releaseTime > now) {
      return releaseTime - now;
    }

    this.bucket.set(key, {
      lastVisit: now,
      penaltylIndex: Math.min(
        cooldown.penaltylIndex + 1,
        this.intervals.length - 1,
      ),
    });

    return 0;
  }

  public reset(key: Key): void {
    this.bucket.delete(key);
  }
}

export { Throttler };
