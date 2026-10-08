// Written for three.js ShaderMaterial with glslVersion: THREE.GLSL3 (in/out/texture, WebGL2).

export const VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Field layout: xy = displacement (uv units, stored as d*2+0.5), zw = velocity (stored as v*0.1+0.5)
export const SIM_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uPrev;
uniform vec2 uP0, uP1;
uniform float uAspect, uRadius, uStrength, uDt, uK, uC, uKick, uSeed, uActive, uSnap;

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec4 s = texture(uPrev, vUv);
  vec2 d = (s.xy - 0.5) * 0.5;
  vec2 v = (s.zw - 0.5) * 10.0;

  // damped spring back to rest
  v += (-uK * d - uC * v) * uDt;
  // a ripple of velocity when the text changes
  v += uKick * 0.35 * vec2(sin(vUv.y * 11.0 + uSeed), cos(vUv.x * 9.0 + uSeed * 1.7));
  d += v * uDt;

  if (uActive > 0.5) {
    vec2 asp = vec2(uAspect, 1.0);
    float dist = segDist(vUv * asp, uP0 * asp, uP1 * asp);
    float f = exp(-dist * dist / (uRadius * uRadius));
    d += (uP1 - uP0) * f * uStrength;   // drag the ink along with the pointer
  }

  float l = length(d);
  if (l > 0.24) d *= 0.24 / l;
  if (l < uSnap && length(v) < uSnap * 20.0) { d = vec2(0.0); v = vec2(0.0); }

  o = vec4(d * 2.0 + 0.5, v * 0.1 + 0.5);
}`;

export const DRAW_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex, uField;
uniform vec2 uRes;
uniform float uCell, uTexW;
uniform vec3 uPaper, uInk;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 p = gl_FragCoord.xy;
  const float A = 0.785398;                       // 45° screen angle
  mat2 R = mat2(cos(A), -sin(A), sin(A), cos(A));

  vec2 q = R * p / uCell;
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  vec2 c = transpose(R) * ((id + 0.5) * uCell);   // cell centre back in screen px
  vec2 uv = c / uRes;

  vec2 d = (texture(uField, uv).xy - 0.5) * 0.5;
  float mag = length(d);

  // blur the text to roughly one cell, so tone = ink coverage under the dot
  float lod = log2(max(uCell * uTexW / uRes.x, 1.0));
  float lum = textureLod(uTex, uv - d, lod).r;

  // stretched ink prints a little heavier
  float r = sqrt(clamp(lum, 0.0, 1.0)) * 0.72 * (1.0 + min(mag * 6.0, 0.35));
  float dist = length(f);
  float aa = 1.2 / uCell;

  float dotMask = (1.0 - smoothstep(r - aa, r + aa, dist)) * smoothstep(0.0, 0.06, r);
  float ghost = (1.0 - smoothstep(0.1 - aa, 0.1 + aa, dist)) * 0.16;

  vec3 col = mix(uPaper, uInk, max(dotMask, ghost));
  col += (hash(p) - 0.5) * 0.025;                 // paper grain
  o = vec4(col, 1.0);
}`;
