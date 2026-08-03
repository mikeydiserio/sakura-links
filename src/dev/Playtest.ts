import * as THREE from 'three';
import { COURSES } from '../course';
import { THEMES } from '../render/Palette';
import { MIN_SHOT_SPEED, MAX_SHOT_SPEED } from '../gameplay/AimSystem';
import { Rng } from '../util/math';
import type { HoleRuntime } from '../gameplay/HoleRuntime';
import type { CourseDef, HoleDef } from '../course/types';

/**
 * Automated playtest harness.
 *
 * "Every hole is completable" is a claim that can only be made honestly by
 * actually completing every hole, and doing that by hand across two dozen holes
 * — repeatedly, after every layout change — is not realistic. So a bot does it.
 *
 * The bot is deliberately *worse* than a human: it aims at the pin with noise
 * and has no understanding of ramps, moving platforms or dog-legs. If a
 * strategy this crude can reliably hole out, a player can. Conversely, when the
 * bot cannot finish, the report says why — out of bounds every attempt, no
 * progress, or the ball never coming to rest — and that is nearly always a real
 * layout bug rather than a bot limitation.
 *
 * Runs headless: no rendering, no camera, no audio. A full sweep is seconds.
 */

export interface HoleReport {
  courseId: string;
  courseName: string;
  holeId: string;
  holeName: string;
  index: number;
  par: number;
  /** Did the bot hole out at all? */
  completed: boolean;
  /** Strokes taken on its best successful attempt. */
  strokes: number;
  /** How many of the attempts ended in a hole-out. */
  successRate: number;
  /** Penalty strokes incurred across all attempts. */
  penalties: number;
  /** Closest the ball ever got to the cup on a failed run, in world units. */
  closestApproach: number;
  issues: string[];
}

export interface PlaytestSummary {
  holes: HoleReport[];
  failures: HoleReport[];
  totalHoles: number;
  elapsedMs: number;
}

interface BotOptions {
  /** Independent attempts per hole. More attempts, more confidence. */
  attempts?: number;
  /** Stroke budget per attempt before the bot gives up. */
  maxStrokes?: number;
  seed?: number;
}

/**
 * Converts a target distance into a charge value.
 *
 * The ball's roll follows `v(t) = v₀·e^(−kt)`, so total distance is `v₀/k`.
 * Inverting that gives the launch speed for a desired distance, which then maps
 * back through the charge curve. Overshooting slightly is safer than coming up
 * short — a ball that stops early has made no progress, one that runs past the
 * pin usually still ends somewhere useful.
 */
function chargeForDistance(distance: number, resistance = 0.95): number {
  const speed = Math.min(MAX_SHOT_SPEED, distance * resistance * 1.12);
  // Inverts `AimSystem.shotSpeed`, which maps charge to speed linearly. The bot
  // calls `devStrike` with a charge value directly, so it never goes through the
  // swing meter — the meter's rise/fall shape is a player-timing device and has
  // no bearing on what the bot is measuring.
  return THREE.MathUtils.clamp(
    (speed - MIN_SHOT_SPEED) / (MAX_SHOT_SPEED - MIN_SHOT_SPEED),
    0,
    1,
  );
}

/** Plays one hole repeatedly and reports what happened. */
function playHole(
  runtime: HoleRuntime,
  course: CourseDef,
  hole: HoleDef,
  index: number,
  options: Required<BotOptions>,
): HoleReport {
  const report: HoleReport = {
    courseId: course.id,
    courseName: course.name,
    holeId: hole.id,
    holeName: hole.name,
    index,
    par: hole.par,
    completed: false,
    strokes: Infinity,
    successRate: 0,
    penalties: 0,
    closestApproach: Infinity,
    issues: [],
  };

  const rng = new Rng(options.seed + index * 7919);
  const cup = new THREE.Vector3();
  const ball = new THREE.Vector3();
  let successes = 0;
  let stalledRuns = 0;

  for (let attempt = 0; attempt < options.attempts; attempt++) {
    runtime.load(hole, THEMES[course.theme]);
    runtime.beginPlay();

    let penalties = 0;
    let noise = 0.06;
    let bestDistance = Infinity;
    let strokesWithoutProgress = 0;
    let holed = false;

    for (let stroke = 0; stroke < options.maxStrokes; stroke++) {
      // If the ball came to rest on a lift or ferry, ride it before playing on.
      // Without this the bot fires the instant the ball settles, which on a
      // timing hole means shooting off the platform at the bottom of the shaft
      // every single time — the hole then reports as unplayable when the real
      // answer is that a player would have waited.
      runtime.devRidePlatform();

      runtime.devCupPosition(cup);
      ball.copy(runtime.ballPosition);

      const distance = Math.hypot(cup.x - ball.x, cup.z - ball.z);
      report.closestApproach = Math.min(report.closestApproach, distance);
      if (distance < bestDistance - 0.25) {
        bestDistance = distance;
        strokesWithoutProgress = 0;
        noise = 0.06;
      } else {
        strokesWithoutProgress++;
        // Widen the search when stuck. A dog-leg or a gap cannot be solved by
        // aiming straight at the pin, so the bot has to explore.
        noise = Math.min(1.5, noise + 0.14);
      }

      // Inside four units the bot putts: small aim spread, measured pace. The
      // random "swing out of trouble" behaviour below is for when it is stuck
      // behind something, and applying it to a tap-in just fires the ball off
      // the green again — which is not how a player would miss.
      const closeRange = distance < 4;
      const spread = closeRange ? Math.min(noise, 0.12) : noise;
      const straight = Math.atan2(cup.x - ball.x, cup.z - ball.z);
      const yaw = straight + rng.range(-spread, spread);

      const power =
        !closeRange && strokesWithoutProgress > 2 && rng.bool(0.5)
          ? rng.range(0.55, 1)
          : THREE.MathUtils.clamp(
              chargeForDistance(distance) + rng.range(-0.06, 0.06),
              0.02,
              1,
            );

      const strokesBefore = runtime.strokes;
      runtime.devMarkRideStart();
      runtime.devStrike(yaw, power);
      const settled = runtime.devSimulateUntilRest();

      // A penalty adds a stroke without the bot asking for one.
      if (runtime.strokes > strokesBefore + 1) penalties += runtime.strokes - strokesBefore - 1;

      if (settled === 'complete' || settled === 'sinking') {
        holed = true;
        break;
      }
      if (settled === 'rolling') {
        report.issues.push('ball never came to rest within 20s');
        stalledRuns++;
        break;
      }
    }

    report.penalties += penalties;

    if (holed) {
      successes++;
      report.completed = true;
      report.strokes = Math.min(report.strokes, runtime.strokes);
    }
  }

  report.successRate = successes / options.attempts;

  if (!report.completed) {
    report.issues.push(
      `bot could not hole out in ${options.attempts} attempts of ${options.maxStrokes} strokes ` +
        `(closest approach ${report.closestApproach.toFixed(2)}u)`,
    );
  } else if (report.successRate < 0.5) {
    report.issues.push(
      `only ${Math.round(report.successRate * 100)}% of attempts finished — likely too punishing`,
    );
  }

  if (report.completed && report.strokes > hole.par + 4) {
    report.issues.push(`best result ${report.strokes} vs par ${hole.par} — par may be unrealistic`);
  }
  if (stalledRuns > 0) report.issues.push(`${stalledRuns} run(s) ended with the ball still moving`);

  // De-duplicate repeated issue strings from multiple attempts.
  report.issues = [...new Set(report.issues)];
  return report;
}

/** Plays every hole of every course and returns a report. */
export function playtestAll(runtime: HoleRuntime, options: BotOptions = {}): PlaytestSummary {
  const resolved: Required<BotOptions> = {
    // The bot has no route-finding, so a hole with a dog-leg or a hazard on the
    // straight line needs several strokes of random search before it stumbles
    // onto the real route. A generous budget keeps "the bot failed" meaning
    // "no route exists" rather than "the bot got unlucky".
    attempts: options.attempts ?? 4,
    maxStrokes: options.maxStrokes ?? 40,
    seed: options.seed ?? 20260802,
  };

  const started = performance.now();
  const holes: HoleReport[] = [];

  for (const course of COURSES) {
    course.holes.forEach((hole, index) => {
      holes.push(playHole(runtime, course, hole, index, resolved));
    });
  }

  return {
    holes,
    failures: holes.filter((h) => !h.completed || h.issues.length > 0),
    totalHoles: holes.length,
    elapsedMs: Math.round(performance.now() - started),
  };
}

/** Compact console-friendly rendering of a summary. */
export function formatSummary(summary: PlaytestSummary): string {
  const lines = summary.holes.map((h) => {
    const status = !h.completed ? 'FAIL' : h.issues.length ? 'WARN' : ' ok ';
    const strokes = Number.isFinite(h.strokes) ? String(h.strokes) : '-';
    return (
      `[${status}] ${h.courseId}/${h.index + 1} ${h.holeName.padEnd(18)} ` +
      `par ${h.par}  best ${strokes.padStart(2)}  ` +
      `win ${Math.round(h.successRate * 100)}%  pen ${h.penalties}` +
      (h.issues.length ? `\n         ${h.issues.join('\n         ')}` : '')
    );
  });

  const failed = summary.holes.filter((h) => !h.completed).length;
  return (
    `${lines.join('\n')}\n\n` +
    `${summary.totalHoles} holes, ${failed} unplayable, ` +
    `${summary.failures.length - failed} with warnings, ${summary.elapsedMs}ms`
  );
}
