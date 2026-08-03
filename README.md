# Sakura Links

A stylized, anime-inspired miniature golf game for the browser. Twenty-four holes across
three themed courses. Built with Three.js, cannon-es and TypeScript.

**Every asset is generated procedurally at runtime.** There are no model files, no
textures, no HDRIs, no audio files and no fonts in this repository — meshes come from
`BufferGeometry`/`ExtrudeGeometry`, textures from `CanvasTexture`/`DataTexture`, and
every sound from the Web Audio API.

---

## Install and run

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default `http://localhost:5173`).

```bash
npm run build     # type-check with tsc, then bundle with Vite
npm run preview   # serve the production build
```

Requires a browser with WebGL 2 (any current Chrome, Edge, Firefox or Safari). The game
detects a missing WebGL context at boot and shows a readable message instead of failing
inside the renderer.

---

## Controls

| Input | Action |
|---|---|
| **Move mouse** | Aim |
| **Hold left mouse / Space** | Charge the shot |
| **Release** | Swing |
| **Right-drag** | Orbit the camera without changing your aim |
| **Mouse wheel** | Zoom |
| **A / D**, **←/→** | Fine aim adjustment |
| **W / S**, **↑/↓** | Camera pitch |
| **C** | Recentre the camera on the pin |
| **R** | Restart the current hole |
| **T** | Toggle overhead view |
| **Esc** | Pause |

Power ramps from zero to full over about one second of holding, then stays at maximum —
there is no oscillating meter to fight. The dotted line previews where the ball will
come to rest, and it stops at a ledge rather than drawing over thin air.

---

## Architecture

```
src/
├─ main.ts                 Entry point; WebGL capability check
├─ core/
│  ├─ Game.ts              Frame loop, app state machine, system wiring
│  ├─ Input.ts             Pointer/keyboard → intents
│  ├─ Events.ts            Typed publish/subscribe bus
│  └─ Storage.ts           Versioned LocalStorage save data
├─ render/
│  ├─ Renderer.ts          WebGL context + post-processing chain
│  ├─ CelMaterial.ts       The cel-shading material (see below)
│  ├─ OutlineMaterial.ts   Inverted-hull ink outlines
│  ├─ EdgePass.ts          Screen-space Sobel outlines
│  ├─ BloomPass.ts         Threshold bloom
│  ├─ GradePass.ts         Saturation, contrast, vignette, flash
│  ├─ Palette.ts           The three themes
│  ├─ TextureFactory.ts    All procedural textures
│  └─ GeometryCache.ts     Shared immutable primitives
├─ physics/PhysicsWorld.ts cannon-es wrapper, surface registry, raycasts
├─ dev/
│  ├─ Playtest.ts          Bot that plays every hole; proves they are completable
│  └─ ValidateLayout.ts    Static geometry checks on the course data
├─ course/
│  ├─ types.ts             The hole-authoring DSL
│  ├─ HoleBuilder.ts       DSL → meshes + bodies + behaviour
│  ├─ Props.ts             Decorative objects
│  └─ courses/             The three courses, as data
├─ gameplay/
│  ├─ Ball.ts              Physics body, rolling model, squash & stretch
│  ├─ Club.ts              Putter and swing animation
│  ├─ AimSystem.ts         Aim, charge, trajectory preview
│  ├─ CameraRig.ts         Orbit/follow/cinematic camera
│  └─ HoleRuntime.ts       Turn loop, hazards, win condition
├─ world/                  Sky, environment, water, foliage, ambient particles
├─ fx/                     Pooled particles, camera shake/hit-stop, ball trail
├─ audio/                  Web Audio engine, SFX synthesis, generative music
└─ ui/                     DOM interface and stylesheet
```

Systems communicate through a typed event bus rather than direct references, so audio,
particles and UI can react to gameplay without gameplay knowing they exist. There are no
global singletons; everything is owned by `Game` and disposed explicitly.

---

## Rendering pipeline

```
RenderPass ─► EdgePass ─► BloomPass ─► GradePass ─► OutputPass
```

`OutputPass` performs the linear → sRGB encode, so every shader in the project writes
**linear** colour and never calls an encoding include. Tone mapping is deliberately off:
filmic curves desaturate exactly the punchy primaries this art direction depends on, so
`GradePass` applies a gentler custom shoulder instead.

### Cel shading (`CelMaterial.ts`)

One custom `ShaderMaterial` shades every solid surface. Three's light rig is bypassed
entirely — lighting is a single key direction plus hemisphere ambient, held in **shared
uniform objects** so a frame update is one write rather than a scene traversal.

Four stylisation terms combine:

1. **Quantised wrapped diffuse.** `N·L` is remapped from `[-1,1]` to `[0,1]` rather than
   clamped, which keeps the unlit side readable the way cel animation handles form
   shadows. The result indexes a 4-band ramp `DataTexture` sampled with `NearestFilter` —
   any filtering at all re-introduces a gradient and destroys the effect. Band edges are
   hand-tuned rather than evenly spaced: the two lit bands sit close together so most of a
   surface reads as "lit" with one decisive shadow edge. Lit bands are tinted slightly
   warm and shadow bands slightly cool, an old cel-animation trick.
2. **Hard-edged specular.** A Blinn lobe passed through `smoothstep` becomes a discrete
   highlight shape rather than a falloff.
3. **Fresnel rim light**, also banded, so it reads as painted light rather than a glow.
4. **Hemisphere ambient** tinted by surface orientation, with the darkest band deepened
   so contact areas do not go flat.

The shader handles instancing, instance colour, vertex colour, an optional map, wind sway
and manual distance fog. Both `normalize()` calls are guarded against zero-length input —
a NaN here survives blending and poisons the bloom chain downstream.

### Two outline systems

They solve different halves of the same problem and are used together:

- **Inverted hull** (`OutlineMaterial.ts`) — the mesh is drawn again with `side: BackSide`
  and its vertices pushed along their normals. Offsetting in *view* space by `k · -mv.z`
  cancels the perspective divide exactly, so a 3 px line stays 3 px at any distance. This
  gives clean, weighty silhouettes that never flicker. Instanced meshes share their
  parent's `instanceMatrix`, so 400 flowers still cost one outline draw.
- **Screen-space Sobel** (`EdgePass.ts`) — a Sobel filter over view normals and linearised
  depth from a single override-material prepass. This catches *interior* creases — where
  two faces of the same object meet, a ramp joins a green, a roof folds — which a hull can
  never produce. The depth term is normalised by the *nearest* tap rather than the centre
  one, so a silhouette against the sky is not divided by the far plane and erased.

Sky and particles live on a separate layer excluded from the prepass; tracing ink around
cloud bands and dust motes only adds noise.

### Bloom

`BloomPass.ts` is hand-written rather than `UnrealBloomPass`, for two reasons.

The practical one: Three's bloom has no guard on its input, so a single non-finite pixel
propagates through the blur chain and paints an entire mip-sized rectangle black. This
project hit exactly that failure. The bright pass here sanitises every sample with an
explicit finite test (`x >= 0.0` is false for NaN, where `clamp()` would pass it straight
through), so a bad pixel can never spread.

The artistic one: five mip levels are tuned for photoreal HDR. Three levels with a soft-knee
threshold give the punchy, contained glow a cel palette wants, for roughly half the
bandwidth.

---

## Procedural generation

### Textures (`TextureFactory.ts`)

Two techniques, chosen per job. `DataTexture` for exact tiny lookup tables where pixel
control matters (the lighting ramp). `CanvasTexture` for painterly detail: grass with
value-noise blotches plus mowing stripes and hatch marks, stone laid as offset courses
with bevel highlights and speckle, sand with raked zen arcs, wood with per-plank tone
variation and wobbling grain, arcade grids, feathered cloud sprites, five-petal blossoms,
four-point sparkles, and a dimpled ball with a coloured band that makes spin legible.
Everything is memoised by key, so every hole sharing a stone texture uploads one.

### Geometry

Trees are grown, not modelled: a stack of tapering, slightly drunken trunk segments, then
a canopy that varies by species — overlapping squashed icosahedra for blossom trees,
stacked cones for conifers, radial extruded fronds for palms. Rocks are icosahedra with
per-*unique-position* jitter so shared corners stay welded. Grass blades are tapered,
forward-curling strips. Flowers are a rose curve `r = 0.42 + 0.58|cos(2.5θ)|` run through
`ExtrudeGeometry`. Mountains are asymmetric extruded prisms in three rings, each tinted
further toward the fog colour for atmospheric perspective. All of it is seeded, so a given
course looks identical on every machine.

### The hole DSL

Holes are **data**, not code. Each piece kind has one branch in `HoleBuilder` that
produces geometry, collision and behaviour together:

```ts
{ kind: 'tile', x: 0, z: 1.5, w: 6.5, d: 6.2, y: 0.82, tilt: 0.265, walls: 'EW' }
```

A tile is a slab plus up to four rails, authored relative to its **top surface** and
transformed as one rigid frame — which is what lets a tilted ramp keep its rails attached
at the correct angle for free. Wall flags are compass letters in the tile's local space,
so enclosure is authored rather than inferred, and a corridor simply omits the edges it
opens onto.

That split is why twenty-four holes cost authoring time rather than engineering time, and
why a hole can be balanced by reading a single object literal.

Two authoring rules matter enough to state plainly, because breaking either produces a
hole that looks perfect and is unfinishable:

1. **A rail encloses; tiles must fill what it encloses.** An L-shaped hole built from two
   legs leaves the inside of the elbow empty, and the ball drops through a patch of
   nothing that is invisible from every camera angle.
2. **A ramp must meet a deck with minimal overlap.** Overlap them deeply and the deck's
   vertical side face stands proud across the middle of the ramp — the ball hits it and
   rolls back down, every time, no matter how well it was struck.

Both are checked automatically; see *Tooling* below.

---

## Tooling

Two dev-only harnesses, code-split out of production builds and exposed on `window` when
running `npm run dev`. Both exist because "every hole is completable" is a claim that
cannot be made honestly by hand across two dozen holes, re-checked after every edit.

### `__validate()` — static layout checks

Reads the course data and reports geometry that cannot work:

- **Reachability.** Flood-fills from the tee across connected surfaces and confirms the
  cup's patch is reached, naming the widest break when it is not.
- **Floor coverage.** Samples the area each closed rail encloses and reports any of it
  without floor beneath — the L-elbow bug above.
- Tees or cups suspended over nothing, and surfaces orphaned from the main route.

### `__playtest()` — a bot that actually plays

Plays every hole four times, up to forty strokes each, headless — no rendering, camera or
audio — so a full 24-hole sweep takes about fifteen seconds. It aims at the pin with
noise, widens its search when it stops making progress, and putts rather than swings
inside four units.

The bot is deliberately worse than a person: it cannot read a windmill's rhythm or plan a
route around a dog-leg. That is the point. If a strategy this crude reliably holes out, a
player can. When it cannot, the report distinguishes *no route exists* from *too
punishing* from *the ball never came to rest*, and in practice it has been a real bug
nearly every time.

### Audio

Everything is synthesised. Impacts are a filtered noise transient plus a pitched body —
the noise carries the material (stone is dull and low-Q, metal bright and ringing), the
tone carries the force, and pitch rising with impact speed is what makes a hard hit *read*
as hard rather than merely louder. Rolling is one persistent looping noise source whose
bandpass frequency and gain track ball speed and surface; starting a source per frame
would click.

Music is generative, not looped. A lookahead scheduler queues notes 150 ms ahead using
`AudioContext` timestamps, so a frame hitch cannot make it stutter. Each theme picks a
mode and a four-chord progression — major pentatonic for the gardens (no semitone clashes,
so a random walk always sounds intentional), Lydian for the sky islands (the raised fourth
is what makes it sound airborne), minor with a driving bass for the arcade.

---

## Physics

cannon-es, stepped at a fixed 120 Hz with up to twelve catch-up sub-steps. A putt reaches
~20 units/s while the ball is 0.36 across, which is comfortably inside tunnelling range at
60 Hz.

**Rolling resistance is applied manually.** cannon's Coulomb friction resists sliding, not
rolling; left to it, a sphere on a plane keeps almost all its energy and creeps for a very
long time — physically defensible and terrible to play. Instead the ball raycasts down each
frame to identify its surface and applies an explicit exponential velocity decay. That one
change gives each surface a personality (sand grabs at 6.2, ice barely bites at 0.12) and
guarantees the ball always settles, which the turn loop depends on.

### One cannon quirk worth knowing about

`PhysicsWorld.register()` forces `body.updateAABB()` after positioning every body, and
this is not defensive padding — without it most of the game does not work.

cannon caches each body's bounding volume and only refreshes it when `aabbNeedsUpdate` is
set. Assigning to `body.position` *cannot* set that flag, because `Vec3` has no change
tracking. A static body constructed at the origin and then moved into place therefore
keeps an AABB centred on the origin indefinitely. The narrowphase still uses the real
transform, so collisions look correct wherever the broadphase happens to return the body —
which is only where the stale AABB overlaps the query. The result is that geometry far
from world centre is silently invisible to raycasts and collision alike. Balls fall
through floors; surface probes report a void; holes fail in proportion to how far from the
origin they were built.

Two further deliberate collision choices:

- **Domes are spheres, not trimeshes.** A dome is convex, so it collides as the single
  most robust primitive cannon offers. Sphere-vs-trimesh is the engine's weakest pair —
  in testing a fast ball passed straight through a triangle, fell out of the world and
  cost a phantom penalty stroke. Given footprint `R` and height `h`, the sphere through
  both rim and apex has radius `(R² + h²) / 2h`; the visual mesh is generated from that
  same sphere, so what you see and what you roll on are the same surface by construction.
- **Moving platforms are driven by velocity, not teleported**, so contact friction carries
  the ball with them instead of letting it slide. They also *dwell* at each end of their
  travel for a third of the cycle rather than sweeping sinusoidally: a platform that is
  almost never where you need it turns a timing puzzle into a coin flip.

Loft is near zero. A putter is a ground club: at 20 units/s even a 0.13 loft factor arcs
the ball clean over a rail and out of the hole.

Rail height is derived rather than eyeballed. A ball leaving a ramp of angle θ at the
speed cap carries `v·sinθ` upward and rises `(v·sinθ)² / 2g`; at 22 u/s and the steepest
authored ramp that is about 1.07 units, so rails stand at 1.15. For the same reason no
authored ramp exceeds 0.3 rad, and vertical jump pads appear only where flying is the
point — inside a railed corridor a pad throws the ball straight out of the course.

---

## Optimization

Performance is treated as a design requirement, not a pass at the end.

- **Draw-call bucketing.** Static hole geometry is grouped by material and merged, so a
  hole with 40 tiles and 90 wall segments renders in a handful of calls. Inverted-hull
  outlines survive the merge — each box's back faces are still enclosed by its own front
  faces, so every box keeps its silhouette.
- **Instancing** for grass, flowers and rocks, with per-instance colour variation so a
  field never reads as a decal.
- **Shared uniforms.** Time, camera position, key light and fog are the same objects on
  every material — one write per frame, no traversal.
- **Caches.** Geometry and texture caches are memoised and flagged `shared`, so hole
  teardown frees only genuinely unique resources.
- **Object pooling.** Particles are fixed-size typed arrays with a cursor; emitting never
  allocates. The trail is a ring buffer expanded into a pre-allocated strip. The frame loop
  as a whole is allocation-free.
- **Adaptive pixel ratio.** A rolling frame-time average walks resolution down when the
  budget slips and back up when there is headroom, sampled over ~1 s windows so a single
  hitch never causes a visible change.
- **Explicit disposal.** Every hole tears down its geometry, materials and physics bodies;
  outline shells that borrow their parent's geometry are skipped so nothing is freed twice.

Enable the FPS readout in Settings to see frame rate, draw calls, triangle count, current
pixel ratio and physics body count.

---

## Progression

Strokes, per-hole bests, best round totals and completion times persist to LocalStorage
under a versioned key; a corrupt or stale blob degrades to a fresh save rather than
crashing the boot sequence. Courses unlock in order — finish one to open the next.

---

## Future improvements

- **Replays.** The simulation is deterministic given the same inputs; recording strokes
  would allow shareable replays and ghost balls with no extra physics work.
- **Real-time shadows.** Currently blob shadows, chosen because a shadow map fights flat
  cel lighting. A stylised hard-edged shadow pass with the same quantisation as the ramp
  would fit the art direction better than either.
- **Course editor.** The DSL is already declarative and JSON-serialisable; a visual editor
  writing the same structures is a natural next step.
- **More surfaces.** Conveyor belts, sticky tar and one-way gates all fit the existing
  piece/surface model without touching the builder's structure.
- **Mobile input.** The pointer path is touch-compatible, but the UI layout and aim
  sensitivity need a dedicated pass.
- **Bundle size.** Three is ~516 KB minified; a custom build importing only the used
  modules would cut that substantially.
