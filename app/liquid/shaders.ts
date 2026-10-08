export const VERT = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const FRAG = `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform int uCount;
uniform vec3 uBlobs[40]; // x, y (pixels, origin bottom-left), r
uniform vec2 uMouse;

// signed field value (metaball sum) at a point
float fieldAt(vec2 p) {
  float f = 0.0;
  for (int i = 0; i < 40; i++) {
    if (i >= uCount) break;
    vec3 b = uBlobs[i];
    vec2 d = p - b.xy;
    float r2 = b.z * b.z;
    f += r2 / max(dot(d, d), 1.0);
  }
  return f;
}

vec3 palette(float t, float glow) {
  // Dodo black -> lime liquid metal
  vec3 dark = vec3(0.02, 0.03, 0.02);
  vec3 lime = vec3(0.63, 1.0, 0.13);
  vec3 mint = vec3(0.55, 0.98, 0.72);
  vec3 c = mix(dark, lime, smoothstep(0.0, 1.0, t));
  c = mix(c, mint, glow * 0.5);
  return c;
}

void main() {
  vec2 uv = gl_FragCoord.xy;
  vec2 res = uResolution;

  float f = fieldAt(uv);
  float threshold = 1.0;
  float edge = smoothstep(threshold - 0.15, threshold + 0.15, f);

  // background: soft vignette + grid dots
  vec2 norm = uv / res;
  float vig = smoothstep(1.2, 0.2, length(norm - 0.5));
  vec3 bg = mix(vec3(0.0), vec3(0.03, 0.045, 0.03), vig);

  // subtle dotted grid
  vec2 grid = mod(uv, 28.0) - 14.0;
  float gridDot = smoothstep(1.6, 0.0, length(grid));
  bg += gridDot * 0.035 * vec3(0.63, 1.0, 0.13);

  if (edge < 0.02) {
    gl_FragColor = vec4(bg, 1.0);
    return;
  }

  // approximate normal via gradient of field for liquid-metal shading
  float eps = 1.5;
  float fx = fieldAt(uv + vec2(eps, 0.0)) - fieldAt(uv - vec2(eps, 0.0));
  float fy = fieldAt(uv + vec2(0.0, eps)) - fieldAt(uv - vec2(0.0, eps));
  vec3 normal = normalize(vec3(-fx, -fy, eps * 6.0));

  vec3 lightDir = normalize(vec3(-0.4, 0.6, 0.9));
  float diff = max(dot(normal, lightDir), 0.0);
  float spec = pow(max(dot(reflect(-lightDir, normal), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);

  float fresnel = pow(1.0 - max(normal.z, 0.0), 2.5);

  float shade = diff * 0.7 + 0.25;
  vec3 base = palette(shade, fresnel);
  vec3 col = base + spec * vec3(1.0, 1.0, 0.9) * 0.9;
  col += fresnel * vec3(0.63, 1.0, 0.13) * 0.5;

  // inner glow near the merge core
  float core = smoothstep(threshold + 0.15, threshold + 2.2, f);
  col = mix(col, vec3(0.08, 0.12, 0.08), core * 0.25);

  float alpha = edge;
  vec3 outCol = mix(bg, col, alpha);

  gl_FragColor = vec4(outCol, 1.0);
}
`;
