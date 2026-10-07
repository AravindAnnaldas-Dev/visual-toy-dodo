export const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/**
 * Ink pass. The buffer holds one density per plate in r/g/b.
 * Each plate stamps a soft capsule along the segment it travelled this frame.
 */
export const INK_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPrev;
uniform vec2 uP0[3];
uniform vec2 uP1[3];
uniform float uR[3];
uniform float uAspect, uDt, uRate, uFade, uStamp;
uniform vec2 uWipeC;
uniform float uWipeR;

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec3 d = texture2D(uPrev, vUv).rgb;
  d = max(d - uFade * uDt, 0.0);

  vec2 asp = vec2(uAspect, 1.0);
  vec2 p = vUv * asp;
  vec3 add = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float dist = segDist(p, uP0[i] * asp, uP1[i] * asp);
    float f = exp(-2.2 * dist * dist / (uR[i] * uR[i]));
    if (i == 0) add.r = f; else if (i == 1) add.g = f; else add.b = f;
  }
  d = min(d + add * uRate * uDt * uStamp, 1.6);

  // wipe: an expanding circle that clears the paper
  if (uWipeR > 0.0) {
    float e = 1.0 - smoothstep(uWipeR - 0.1, uWipeR, length((vUv - uWipeC) * asp));
    d *= 1.0 - e;
  }
  gl_FragColor = vec4(d, 1.0);
}`;

/**
 * Display pass. Three halftone screens at the classic C/M/Y angles,
 * each reading its own density channel, composited like real ink.
 */
export const DISPLAY_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uInk;
uniform vec2 uRes;
uniform float uCell, uAdditive;
uniform vec3 uPaper, uC0, uC1, uC2;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

float plate(vec2 p, float deg, vec4 mask) {
  float a = radians(deg);
  mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 q = R * p / uCell;
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  vec2 uv = (transpose(R) * ((id + 0.5) * uCell)) / uRes;
  float d = dot(texture2D(uInk, uv), mask);
  float r = sqrt(clamp(d, 0.0, 1.0)) * 0.76 * smoothstep(0.0, 0.05, d);
  float aa = 1.1 / uCell;
  return 1.0 - smoothstep(r - aa, r + aa, length(f));
}

void main() {
  vec2 p = gl_FragCoord.xy;
  float c0 = plate(p, 15.0, vec4(1.0, 0.0, 0.0, 0.0));
  float c1 = plate(p, 75.0, vec4(0.0, 1.0, 0.0, 0.0));
  float c2 = plate(p, 0.0,  vec4(0.0, 0.0, 1.0, 0.0));

  vec3 sub = uPaper;
  sub *= mix(vec3(1.0), uC0, c0);
  sub *= mix(vec3(1.0), uC1, c1);
  sub *= mix(vec3(1.0), uC2, c2);

  vec3 add = uPaper + (uC0 * c0 + uC1 * c1 + uC2 * c2) * 0.72;
  vec3 col = mix(sub, min(add, vec3(1.0)), uAdditive);

  col += (hash(p) - 0.5) * 0.03;   // paper tooth
  gl_FragColor = vec4(col, 1.0);
}`;
