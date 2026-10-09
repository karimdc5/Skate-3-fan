// Trick definitions and the "flick-it" right-stick gesture recognizer.

// roll: board flips around its long axis (turns), yaw: board spins flat (turns)
export const TRICKS = {
  ollie:      { name: 'Ollie',            roll: 0,  yaw: 0,    dur: 0.30, pts: 100 },
  kickflip:   { name: 'Kickflip',         roll: -1, yaw: 0,    dur: 0.45, pts: 300 },
  heelflip:   { name: 'Heelflip',         roll: 1,  yaw: 0,    dur: 0.45, pts: 300 },
  popShove:   { name: 'Pop Shove-it',     roll: 0,  yaw: 0.5,  dur: 0.38, pts: 250 },
  fsShove:    { name: 'FS Pop Shove-it',  roll: 0,  yaw: -0.5, dur: 0.38, pts: 250 },
  flip360:    { name: '360 Flip',         roll: -1, yaw: 1,    dur: 0.55, pts: 800 },
  laserFlip:  { name: 'Laser Flip',       roll: 1,  yaw: -1,   dur: 0.58, pts: 900 },
};

export function trickLabel(key, nollie) {
  const t = TRICKS[key];
  if (!nollie) return t.name;
  return key === 'ollie' ? 'Nollie' : 'Nollie ' + t.name;
}

const DEG = 180 / Math.PI;
const wrap = a => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };

// Stick convention: x right +, y down + (same as gamepads).
// Angle: 0 = up, 90 = right, -90 = left, 180 = down.
const angleOf = (x, y) => Math.atan2(x, -y) * DEG;

export class FlickRecognizer {
  constructor() {
    this.reset();
    this.lastSeen = '';
  }

  reset() {
    this.state = 'idle';
    this.base = null;
    this.t = 0;
    this.cum = 0;
    this.lastAng = 0;
    this.side = null;
    this.releaseT = 0;
    this.leftBaseT = -1;
    this.manualHold = null;
  }

  // Returns a trick event {key, nollie} or null.
  update(x, y, dt) {
    const mag = Math.hypot(x, y);
    const nolliePre = this.base === 'nose';
    // Mirror nollie gestures so the same logic applies (start up, flick down).
    const mx = x, my = nolliePre ? -y : y;
    const ang = angleOf(mx, my);
    let event = null;

    switch (this.state) {
      case 'idle': {
        this.manualHold = null;
        if (mag > 0.55) {
          const a = angleOf(x, y);
          if (Math.abs(wrap(a - 180)) < 50) this.arm('tail', angleOf(x, y));
          else if (Math.abs(a) < 50) this.arm('nose', angleOf(x, -y));
          else this.state = 'ignore';
        }
        break;
      }
      case 'ignore':
        if (mag < 0.25) this.state = 'idle';
        break;
      case 'cooldown':
        this.manualHold = null;
        if (mag < 0.3) this.state = 'idle';
        break;
      case 'armed': {
        this.t += dt;
        const inBase = mag > 0.35 && Math.abs(wrap(ang - 180)) < 40;
        if (mag > 0.45) {
          // only count smooth movement around the rim, not jumps across the centre
          const d = wrap(ang - this.lastAng);
          if (Math.abs(d) < 75) this.cum += d;
          this.lastAng = ang;
          this.releaseT = 0;
        }
        if (inBase) {
          this.leftBaseT = -1;
          if (this.t > 0.28) this.manualHold = this.base === 'tail' ? 'manual' : 'nose';
        } else {
          if (this.leftBaseT < 0) this.leftBaseT = this.t;
          this.manualHold = null;
        }
        if (mag > 0.6 && Math.abs(wrap(ang - 90)) < 35) this.side = 'right';
        if (mag > 0.6 && Math.abs(wrap(ang + 90)) < 35) this.side = 'left';

        // Reached the opposite direction: the flick.
        if (mag > 0.6 && Math.abs(ang) < 70) {
          let key;
          if (this.cum > 120) key = 'flip360';
          else if (this.cum < -120) key = 'laserFlip';
          else if (ang < -22) key = 'kickflip';
          else if (ang > 22) key = 'heelflip';
          else key = 'ollie';
          event = { key, nollie: this.base === 'nose' };
          this.state = 'cooldown';
          break;
        }
        if (mag < 0.25) {
          this.releaseT += dt;
          // a short grace so a quick flick that passes the centre still counts
          if (this.releaseT > 0.12) {
            if (this.side) {
              event = { key: this.side === 'left' ? 'popShove' : 'fsShove', nollie: this.base === 'nose' };
            }
            this.state = 'idle';
            this.manualHold = null;
          }
        }
        if (this.leftBaseT >= 0 && this.t - this.leftBaseT > 0.6) {
          this.state = 'ignore';
          this.manualHold = null;
        }
        break;
      }
    }
    if (event) this.lastSeen = trickLabel(event.key, event.nollie);
    return event;
  }

  arm(base, ang) {
    this.state = 'armed';
    this.base = base;
    this.t = 0;
    this.cum = 0;
    this.lastAng = ang;
    this.side = null;
    this.releaseT = 0;
    this.leftBaseT = -1;
  }
}
