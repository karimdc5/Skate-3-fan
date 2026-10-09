// Trick definitions and the "flick-it" right-stick gesture recognizer.

// roll: board flips around its long axis (turns)
// yaw: board spins flat (turns)
// pitch: board flips end over end (turns)
export const TRICKS = {
  ollie:       { name: 'Ollie',               roll: 0,  yaw: 0,    pitch: 0, dur: 0.30, pts: 100, diff: 0 },
  kickflip:    { name: 'Kickflip',            roll: -1, yaw: 0,    pitch: 0, dur: 0.45, pts: 300, diff: 1 },
  heelflip:    { name: 'Heelflip',            roll: 1,  yaw: 0,    pitch: 0, dur: 0.45, pts: 300, diff: 1 },
  doubleKick:  { name: 'Double Kickflip',     roll: -2, yaw: 0,    pitch: 0, dur: 0.62, pts: 700, diff: 3 },
  doubleHeel:  { name: 'Double Heelflip',     roll: 2,  yaw: 0,    pitch: 0, dur: 0.62, pts: 700, diff: 3 },
  popShove:    { name: 'Pop Shove-it',        roll: 0,  yaw: 0.5,  pitch: 0, dur: 0.38, pts: 250, diff: 1 },
  fsShove:     { name: 'FS Pop Shove-it',     roll: 0,  yaw: -0.5, pitch: 0, dur: 0.38, pts: 250, diff: 1 },
  shove360:    { name: '360 Shove-it',        roll: 0,  yaw: 1,    pitch: 0, dur: 0.52, pts: 500, diff: 2 },
  fsShove360:  { name: 'FS 360 Shove-it',     roll: 0,  yaw: -1,   pitch: 0, dur: 0.52, pts: 500, diff: 2 },
  varialKick:  { name: 'Varial Kickflip',     roll: -1, yaw: 0.5,  pitch: 0, dur: 0.50, pts: 500, diff: 2 },
  varialHeel:  { name: 'Varial Heelflip',     roll: 1,  yaw: -0.5, pitch: 0, dur: 0.50, pts: 500, diff: 2 },
  hardflip:    { name: 'Hardflip',            roll: 0,  yaw: -0.5, pitch: 1, dur: 0.52, pts: 650, diff: 3 },
  inwardHeel:  { name: 'Inward Heelflip',     roll: 1,  yaw: 0.5,  pitch: 0, dur: 0.52, pts: 650, diff: 3 },
  flip360:     { name: '360 Flip',            roll: -1, yaw: 1,    pitch: 0, dur: 0.55, pts: 800, diff: 3 },
  laserFlip:   { name: 'Laser Flip',          roll: 1,  yaw: -1,   pitch: 0, dur: 0.58, pts: 900, diff: 4 },
  impossible:  { name: 'Impossible',          roll: 0,  yaw: 0,    pitch: 1, dur: 0.48, pts: 600, diff: 3 },
  boneless:    { name: 'Boneless',            roll: 0,  yaw: 0,    pitch: 0, dur: 0.45, pts: 350, diff: 1 },
};

// Tricks done with a hand while grabbing (flick during a grab)
export const FINGERFLIPS = {
  kickflip: 'Fingerflip', heelflip: 'Finger Heelflip', popShove: 'Finger Shove-it', fsShove: 'FS Finger Shove-it',
  ollie: 'Fingerflip', flip360: '360 Fingerflip', laserFlip: 'Fingerflip Laser',
};

// Stance-aware trick name: tail pop when riding fakie = "Fakie", nose pop
// when riding fakie = "Switch", nose pop riding normal = "Nollie".
export function trickLabel(key, nollie, fakie = false) {
  const t = TRICKS[key];
  if (fakie) return (nollie ? 'Switch ' : 'Fakie ') + t.name;
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
    this.firstSide = null;
    this.releaseT = 0;
    this.leftBaseT = -1;
    this.baseTime = 0;
    this.manualHold = null;
  }

  // Returns a trick event {key, nollie, power} or null.
  update(x, y, dt) {
    const mag = Math.hypot(x, y);
    const mx = x, my = this.base === 'nose' ? -y : y;
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
          if (this.firstSide) this.returned = true;
          this.leftBaseT = -1;
          this.baseTime = this.t;
          if (this.t > 0.28) this.manualHold = this.base === 'tail' ? 'manual' : 'nose';
        } else {
          if (this.leftBaseT < 0) this.leftBaseT = this.t;
          this.manualHold = null;
        }
        if (mag > 0.6 && Math.abs(wrap(ang - 90)) < 35) { this.side = 'right'; this.firstSide ||= 'right'; }
        if (mag > 0.6 && Math.abs(wrap(ang + 90)) < 35) { this.side = 'left'; this.firstSide ||= 'left'; }

        // Reached the opposite direction: the flick.
        if (mag > 0.6 && Math.abs(ang) < 70) {
          // a stick rolling around the rim may still be on its way to straight up
          // (360 / laser flip), so wait a few frames before calling a diagonal
          if (this.firstSide && Math.abs(ang) >= 22 && Math.abs(this.cum) > 100 && this.pendT < 0.07) {
            if (this.pendT === 0) this.pendAng = ang;
            this.pendT += dt;
            break;
          }
          event = this.classify(this.pendT > 0 && Math.abs(ang) >= 22 ? this.pendAng : ang);
          this.state = 'cooldown';
          break;
        }
        if (this.pendT > 0) {
          event = this.classify(this.pendAng);
          this.state = 'cooldown';
          break;
        }
        if (mag < 0.25) {
          this.releaseT += dt;
          // a short grace so a quick flick that passes the centre still counts
          if (this.releaseT > 0.12) {
            if (this.firstSide && this.returned) {
              // side and back to the start: a full 360 shove-it
              event = { key: this.firstSide === 'left' ? 'shove360' : 'fsShove360', nollie: this.base === 'nose', power: 1 };
            } else if (this.side) {
              event = { key: this.side === 'left' ? 'popShove' : 'fsShove', nollie: this.base === 'nose', power: 1 };
            }
            this.state = 'idle';
            this.manualHold = null;
          }
        }
        if (this.leftBaseT >= 0 && this.t - this.leftBaseT > 0.7) {
          this.state = 'ignore';
          this.manualHold = null;
        }
        break;
      }
    }
    if (event) this.lastSeen = trickLabel(event.key, event.nollie);
    return event;
  }

  classify(ang) {
    const flickTime = this.leftBaseT >= 0 ? this.t - this.leftBaseT : 0;
    // a snap flick straight from the wind-up (same frame) = doubles / impossible
    const fast = flickTime < 0.001 && this.baseTime > 0.12;
    let key;
    if (this.cum > 150 && Math.abs(ang) < 22) key = 'flip360';
    else if (this.cum < -150 && Math.abs(ang) < 22) key = 'laserFlip';
    else if (this.firstSide === 'left' && ang < -22) key = 'varialKick';
    else if (this.firstSide === 'right' && ang > 22) key = 'varialHeel';
    else if (this.firstSide === 'right' && ang < -22) key = 'hardflip';
    else if (this.firstSide === 'left' && ang > 22) key = 'inwardHeel';
    else if (ang < -22) key = fast ? 'doubleKick' : 'kickflip';
    else if (ang > 22) key = fast ? 'doubleHeel' : 'heelflip';
    else key = fast ? 'impossible' : 'ollie';
    // a longer wind-up gives a higher pop
    const power = 0.85 + Math.min(this.baseTime, 0.3) / 0.3 * 0.25;
    return { key, nollie: this.base === 'nose', power };
  }

  arm(base, ang) {
    this.pendT = 0;
    this.pendAng = 0;
    this.state = 'armed';
    this.base = base;
    this.t = 0;
    this.cum = 0;
    this.lastAng = ang;
    this.side = null;
    this.firstSide = null;
    this.returned = false;
    this.releaseT = 0;
    this.leftBaseT = -1;
    this.baseTime = 0;
  }
}
