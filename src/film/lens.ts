// The "lens": every frame of footage goes through this WebGL2 shader on its
// way to the screen. It does the camera work the footage alone can't:
// action-cam fisheye + chromatic fringing, a whip-pan that hides the AI
// generator's morph, focus-pull blur when Bruno stops to talk, a dog's-eye
// colour mode, a night grade for the finale, and film grain.

export interface LensParams {
  /** Seconds, drives grain. */
  time: number;
  /** 0–1 focus-pull blur (Bruno stopped, cards up). */
  blur: number;
  /** 0–1 horizontal whip-pan smear + light leak. */
  whip: number;
  /** 0–1 dichromatic "Bruno-vision". */
  vision: number;
  /** 0–1 dusk-to-night grade: darks fall away, lights bloom. */
  night: number;
  /** Slow push-in while frozen (1 = none). */
  zoom: number;
  /** Extra darkening for overlays (0–1). */
  dim: number;
  /** Handheld drift, in fractions of the frame, so a held frame still breathes. */
  shift: [number, number];
}

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uRes;      // canvas size in px
uniform vec2 uCover;    // uv scale that crops the 16:9 footage to fill the canvas
uniform float uTime, uBlur, uWhip, uVision, uNight, uZoom, uDim;
uniform vec2 uShift;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec2 toTex(vec2 p) {
  // p: centred canvas coords (-0.5..0.5). Mild extra barrel for the action-cam feel.
  float aspect = uRes.x / uRes.y;
  vec2 q = p * vec2(aspect, 1.0);
  float r2 = dot(q, q);
  p *= 1.0 - 0.045 * r2;
  return clamp(p * uCover / uZoom + 0.5 + uShift, vec2(0.001), vec2(0.999));
}

vec3 tap(vec2 uv) { return texture(uTex, uv).rgb; }

void main() {
  vec2 p = vUv - 0.5;
  vec2 uv = toTex(p);
  vec3 col;

  float radius = uBlur * 0.011;
  float smear = uWhip * 0.07;
  if (radius + smear > 0.0004) {
    // 20-tap golden-angle disc for the focus blur, stretched sideways for the whip.
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 20; i++) {
      float f = float(i) + 0.5;
      float a = f * 2.39996;
      float r = sqrt(f / 20.0);
      vec2 o = vec2(cos(a) * (radius + smear), sin(a) * radius) * r;
      acc += tap(uv + o);
    }
    col = acc / 20.0;
  } else {
    // Chromatic fringing grows toward the edges, like a cheap wide lens.
    vec2 d = (uv - 0.5) * 0.006 * length(p) * 2.0;
    col = vec3(tap(uv + d).r, tap(uv).g, tap(uv - d).b);
  }

  // Night grade: keep the lights, let everything else fall into dusk.
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float keep = smoothstep(0.55, 0.9, lum);
  vec3 dusk = col * vec3(0.42, 0.45, 0.62) + col * keep * vec3(1.15, 0.85, 0.5);
  col = mix(col, dusk, uNight);

  // Bruno-vision: dogs see blues and yellows, with less detail.
  vec3 dog = mat3(0.367, 0.280, -0.012, 0.861, 0.673, 0.043, -0.228, 0.047, 0.969) * col;
  dog = mix(vec3(dot(dog, vec3(0.333))), dog, 0.85);
  col = mix(col, dog, uVision);

  // Warm light leak riding the whip-pan.
  float leak = uWhip * smoothstep(0.9, 0.0, length(p - vec2(0.25, -0.15)));
  col += leak * vec3(1.0, 0.62, 0.3) * 0.9;

  // Vignette, dim, grain.
  float v = smoothstep(0.32, 0.95, length(p * vec2(1.15, 1.0)));
  col *= mix(1.0, 0.58, v);
  col *= 1.0 - uDim;
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 100.0) - 0.5) * 0.04;

  outColor = vec4(col, 1.0);
}`;

const compile = (gl: WebGL2RenderingContext, type: number, src: string) => {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
  return s;
};

export class Lens {
  private gl: WebGL2RenderingContext;
  private tex: WebGLTexture;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private hasFrame = false;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link error");
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    for (const name of ["uTex", "uRes", "uCover", "uTime", "uBlur", "uWhip", "uVision", "uNight", "uZoom", "uDim", "uShift"])
      this.u[name] = gl.getUniformLocation(prog, name);

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.u.uTex, 0);
  }

  /** Uploads the current video frame (or an image) as the texture. */
  upload(source: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.hasFrame = true;
  }

  /** How the 16:9 footage maps onto a canvas of this aspect ("object-fit: cover"). */
  static cover(w: number, h: number): [number, number] {
    const canvasAspect = w / h;
    const videoAspect = 16 / 9;
    return canvasAspect > videoAspect ? [1, videoAspect / canvasAspect] : [canvasAspect / videoAspect, 1];
  }

  render(p: LensParams) {
    if (!this.hasFrame) return;
    const { gl, canvas } = this;
    gl.viewport(0, 0, canvas.width, canvas.height);
    const [cx, cy] = Lens.cover(canvas.width, canvas.height);
    gl.uniform2f(this.u.uRes, canvas.width, canvas.height);
    gl.uniform2f(this.u.uCover, cx, cy);
    gl.uniform1f(this.u.uTime, p.time);
    gl.uniform1f(this.u.uBlur, p.blur);
    gl.uniform1f(this.u.uWhip, p.whip);
    gl.uniform1f(this.u.uVision, p.vision);
    gl.uniform1f(this.u.uNight, p.night);
    gl.uniform1f(this.u.uZoom, p.zoom);
    gl.uniform1f(this.u.uDim, p.dim);
    gl.uniform2f(this.u.uShift, p.shift[0], p.shift[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/** Where a point of the footage (0–1) lands on a canvas of w×h CSS px, ignoring the slight barrel. */
export const footageToScreen = (x: number, y: number, w: number, h: number, zoom = 1) => {
  const [cx, cy] = Lens.cover(w, h);
  return { x: ((x - 0.5) * zoom) / cx * w + w / 2, y: ((y - 0.5) * zoom) / cy * h + h / 2 };
};
