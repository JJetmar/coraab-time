const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

// The worn surface never changes, so it is drawn once per screen and text size into two textures, not every frame.
// uMode 0, wear texture: R = rust stain amount, G = stain depth from rim to core, B = hole (1 = cut away), A = grime.
// uMode 1, detail texture: RG = outline warp (0.5 = none), B = brush streaks (0 = scraped clean, 1 = untouched).
const WEAR_SHADER = `
precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uGlyph;
uniform float uPixel;
uniform float uMode;

// Picks one layout of rust, holes and dirt out of the endless noise.
const vec2 RUST_SEED = vec2(900.12, 505.96);
// Above 1 the rust stains grow, below 1 they shrink.
const float RUST_AMOUNT = 0.95;
const float HOLE_DEPTH = 0.8;
// Widens the fade at the border of each hole, in noise units.
const float HOLE_SOFTNESS = 0.125;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// uPixel is the size of one screen pixel in glyph units. Noise finer than about one pixel would only flicker
// as grain, so it fades out and is replaced by its average (0.5), which keeps the overall shapes the same.
float detail(float frequency) {
    return 1.0 - smoothstep(0.5, 1.0, frequency * uPixel);
}

// Each octave is rotated so the square grid of the value noise never lines up into blocky edges.
float fbm(vec2 p, float frequency, vec2 offset) {
    const mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
    vec2 x = p * frequency + offset;
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 7; i++) {
        value += amplitude * mix(0.5, noise(x), detail(frequency));
        x = turn * x * 2.07 + 17.3;
        frequency *= 2.07;
        amplitude *= 0.5;
    }
    return value;
}

// Static stains like on old painted metal: blotches and specks that fade from a light rust rim to a dark core.
// Returns how much stain to mix in and its depth.
vec2 rust(vec2 p) {
    float blotchNoise = fbm(p, 2.8, vec2(71.4, 38.2));
    float speckNoise = fbm(p, 7.0, vec2(16.8, 92.5));
    float pitNoise = fbm(p, 20.0, vec2(5.1, 44.6));
    float shift = (RUST_AMOUNT - 1.0) * 0.1;
    // Hard thresholds give crisp, ragged stain borders; depth still shades each stain from rim to core.
    float amount = max(smoothstep(0.5 - shift, 0.52 - shift, blotchNoise), smoothstep(0.64 - shift, 0.66 - shift, speckNoise) * 0.85);
    amount = max(amount, smoothstep(0.7 - shift, 0.72 - shift, pitNoise) * 0.9);
    float depth = max(smoothstep(0.52 - shift, 0.68 - shift, blotchNoise), smoothstep(0.66 - shift, 0.76 - shift, speckNoise));
    return vec2(amount * min(RUST_AMOUNT, 1.0), depth);
}

// Fine, nearly horizontal streaks like a wire brush or sandpaper left on the surface: 0 = scraped clean, 1 = untouched.
float brushed(vec2 p) {
    vec2 q = mat2(0.99, -0.14, 0.14, 0.99) * p;
    float coarse = mix(0.5, noise(vec2(q.x * 2.0, q.y * 20.0)), detail(20.0));
    float fine = mix(0.5, noise(vec2(q.x * 5.0, q.y * 50.0)), detail(50.0));
    return smoothstep(0.15, 0.85, coarse * 0.6 + fine * 0.4);
}

// Holes rusted through the letters: 1 = cut away.
float erosion(vec2 p) {
    float holeNoise = fbm(p, 9.0, vec2(88.1, 12.9));
    return smoothstep(0.82 - HOLE_SOFTNESS, 0.84 + HOLE_SOFTNESS, holeNoise) * HOLE_DEPTH;
}

void main() {
    vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) / uGlyph;
    if (uMode < 0.5) {
        vec2 seeded = p + RUST_SEED;
        // Grime: large soft smudges plus fine specks.
        float smudge = smoothstep(0.42, 0.72, fbm(seeded, 1.6, vec2(23.4, 61.8)));
        float specks = smoothstep(0.56, 0.7, fbm(seeded, 14.0, vec2(52.7, 9.3)));
        gl_FragColor = vec4(rust(seeded), erosion(seeded), max(smudge, specks * 0.8));
    } else {
        vec2 crust = vec2(fbm(p, 35.0, vec2(64.2, 19.5)), fbm(p, 35.0, vec2(8.6, 77.3)));
        gl_FragColor = vec4(crust, brushed(p), 1.0);
    }
}`;

// uMask channels: R = big text, G = parts that just changed, B = blurred text for the dark halo.
// uLabels channel R = the small labels, kept separate so they can fade out with uLabelOpacity.
// uWear and uDetail hold the worn surface drawn by WEAR_SHADER.
const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMask;
uniform sampler2D uLabels;
uniform sampler2D uWear;
uniform sampler2D uDetail;
uniform float uLabelOpacity;
uniform float uTime;
uniform float uFlare;
uniform vec2 uResolution;
uniform float uGlyph;

const int BEAM_COUNT = 18;
// Same orange as --orange in style.css (#ff840d), so the letters match the UI.
const vec3 BASE = vec3(1.0, 0.518, 0.051);
// Each beam gets a color between these two: #ff780a and #ff8f0f.
const vec3 BEAM_COLOR_A = vec3(1.0, 0.471, 0.039);
const vec3 BEAM_COLOR_B = vec3(1.0, 0.561, 0.059);
const float RUST_OPACITY = 0.6;
// 0 keeps the rust brown, 1 turns it black.
const float RUST_DARKNESS = 0.22;
const float DIRT = 0.19;
// How far the outline is pushed around by fine noise, in glyph units.
const float EDGE_ROUGHNESS = 0.014;
// Bright light saturates towards this warm yellow instead of white.
const vec3 HOT = vec3(1.0, 0.7, 0.16);
const vec3 RUST_LIGHT = vec3(0.66, 0.28, 0.08);
const vec3 RUST_DARK = vec3(0.3, 0.1, 0.035);

// Distance-based beam: a sharp core plus a wider soft glow, both measured across the beam.
vec3 beam(vec2 p, float index) {
    float angle = index * 2.39996 + sin(uTime * 0.12 + index * 1.3) * 0.5;
    vec2 direction = vec2(cos(angle), sin(angle));
    float offset = sin(uTime * (0.2 + 0.025 * index) + index * 2.1) * 4.5;
    float across = abs(dot(p, vec2(-direction.y, direction.x)) - offset);
    float along = dot(p, direction);

    float core = exp(-across * across / 0.036);
    float glow = exp(-across * across / 0.45);
    float pulse = 0.75 + 0.25 * sin(uTime * 1.2 + index * 4.1);
    float sparkle = 0.88 + 0.12 * sin(along * 10.0 - uTime * (3.0 + 0.3 * index));
    vec3 color = mix(BEAM_COLOR_A, BEAM_COLOR_B, fract(index * 0.37));
    return color * (core * 1.6 + glow * 0.45) * pulse * sparkle;
}

// uGlyph is the base font size as a fraction of the screen height, so the beams scale with the text.
void main() {
    vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) / uGlyph;
    vec4 mask = texture2D(uMask, vUv);
    float label = texture2D(uLabels, vUv).r;
    // Most of the screen has no text, halo or label, and its output would be fully transparent anyway.
    if (mask.r + mask.b + label < 1.0 / 512.0) discard;
    vec4 detail = texture2D(uDetail, vUv);
    // Letters are read through a fine noise warp, which makes their outlines crusty.
    mask = texture2D(uMask, vUv + (detail.rg - 0.5) * EDGE_ROUGHNESS * uGlyph * vec2(uResolution.y / uResolution.x, 1.0));
    float flare = uFlare * mask.g;

    vec3 light = vec3(0.0);
    for (int i = 0; i < BEAM_COUNT; i++) {
        light += beam(p, float(i));
    }
    light *= 1.0 + flare * 1.8;

    // Letters are the plain UI orange between beams; beams blend them towards their own hue, and crossings never go past it.
    float beamAmount = 1.0 - exp(-(light.r + light.g + light.b) * 0.7 - flare * 0.6);
    vec3 beamHue = light / max(max(light.r, light.g), max(light.b, 0.0001));
    // A small lift towards white keeps beam crossings bright.
    vec3 clean = mix(BASE, min(beamHue + 0.15, vec3(1.0)), beamAmount);
    // Rust is scraped thin along the brush streaks, and the scraped lines catch a little light.
    vec4 wear = texture2D(uWear, vUv);
    float brush = detail.b;
    vec3 stainColor = mix(mix(RUST_LIGHT, RUST_DARK, wear.g), vec3(0.0), RUST_DARKNESS);
    vec3 lit = mix(clean, stainColor, clamp(wear.r * mix(0.3, 1.0, brush) * RUST_OPACITY, 0.0, 1.0));
    lit = mix(lit, HOT, (1.0 - brush) * 0.11);
    lit *= 1.0 - DIRT * wear.a;

    // Labels stay clean: they get the beams but none of the rust, streaks or holes.
    float textAlpha = mask.r * (1.0 - wear.b);
    float labelAlpha = label * uLabelOpacity * (1.0 - textAlpha);
    float alpha = textAlpha + labelAlpha;
    // The halo stays outside the letter shape, so holes show the background instead of a dark fill.
    float haloAlpha = mask.b * 0.8 * (1.0 - mask.r);
    vec3 color = lit * textAlpha + clean * labelAlpha;
    gl_FragColor = vec4(color, alpha + haloAlpha * (1.0 - alpha));
}`;

const FLARE_DECAY_PER_SECOND = 2.5;
const LABEL_FADE_SECONDS = 0.6;
// The text block sits this fraction of the screen height below the exact center.
const TEXT_OFFSET = 0.03;
// Default empty space between the visible letters of two lines, in base font sizes.
const LINE_GAP = 0.2;
// Space between a line's letters and its labels, in label font sizes.
const LABEL_GAP = 0.6;

// Both programs share the vertex shader, and aPosition is pinned to location 0 so one attribute setup serves both.
function createProgram(gl, fragmentSource) {
    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? 'Shader linking failed');
    }
    return program;
}

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compilation failed');
    }
    return shader;
}

// Draws text lines into a WebGL canvas, filled with animated laser beams that only show inside the letters.
// A line is { size, labelSize?, gapBefore?, shift?, segments: [{ text, key?, label?, slot? }] }; sizes are relative to the screen-fitting base size.
// A segment with a slot (like '00') is drawn with tabular digits: every digit sits centered in a cell as wide as the
// widest digit, and the value is right-aligned in the slot, so changing values never move the units around them.
export class LaserText {
    constructor(canvas, { fontFamily, animate }) {
        const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true });
        if (gl === null) throw new Error('WebGL is not available');

        this.canvas = canvas;
        this.gl = gl;
        this.fontFamily = fontFamily;
        this.animate = animate;
        this.lines = [];
        this.flareStartedAt = -Infinity;
        this.startedAt = performance.now();
        this.maskCanvas = document.createElement('canvas');
        this.maskContext = this.maskCanvas.getContext('2d');
        this.labelCanvas = document.createElement('canvas');
        this.labelContext = this.labelCanvas.getContext('2d');
        this.labelOpacity = 1;
        this.labelTarget = 1;
        this.lastFrameAt = performance.now();
        this.glyph = 0.1;

        // Phones can drop the WebGL context after sleep; preventDefault allows it to be restored.
        canvas.addEventListener('webglcontextlost', (event) => event.preventDefault());
        canvas.addEventListener('webglcontextrestored', () => {
            this.setupGl();
            this.resize();
        });
        this.setupGl();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        if (this.animate) requestAnimationFrame(() => this.loop());
    }

    setupGl() {
        const gl = this.gl;
        this.program = createProgram(gl, FRAGMENT_SHADER);
        this.wearProgram = createProgram(gl, WEAR_SHADER);

        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        this.createTexture(0);
        this.createTexture(1);
        this.wearTexture = this.createTexture(2);
        this.detailTexture = this.createTexture(3);
        this.wearFramebuffer = gl.createFramebuffer();
        this.detailFramebuffer = gl.createFramebuffer();
        this.wearDrawnFor = '';
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

        gl.useProgram(this.wearProgram);
        this.wearUniforms = {
            resolution: gl.getUniformLocation(this.wearProgram, 'uResolution'),
            glyph: gl.getUniformLocation(this.wearProgram, 'uGlyph'),
            pixel: gl.getUniformLocation(this.wearProgram, 'uPixel'),
            mode: gl.getUniformLocation(this.wearProgram, 'uMode'),
        };

        gl.useProgram(this.program);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uMask'), 0);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uLabels'), 1);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uWear'), 2);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uDetail'), 3);
        this.uniforms = {
            time: gl.getUniformLocation(this.program, 'uTime'),
            flare: gl.getUniformLocation(this.program, 'uFlare'),
            resolution: gl.getUniformLocation(this.program, 'uResolution'),
            glyph: gl.getUniformLocation(this.program, 'uGlyph'),
            labelOpacity: gl.getUniformLocation(this.program, 'uLabelOpacity'),
        };
    }

    // Draws the worn surface into the wear and detail textures; skipped while the screen and text size stay the same.
    drawWear() {
        const gl = this.gl;
        const { width, height } = this.canvas;
        const size = `${width}x${height}@${this.glyph}`;
        if (size === this.wearDrawnFor) return;
        this.wearDrawnFor = size;

        gl.useProgram(this.wearProgram);
        gl.uniform2f(this.wearUniforms.resolution, width, height);
        gl.uniform1f(this.wearUniforms.glyph, this.glyph);
        gl.uniform1f(this.wearUniforms.pixel, 1 / (this.glyph * height));
        const targets = [[2, this.wearTexture, this.wearFramebuffer], [3, this.detailTexture, this.detailFramebuffer]];
        for (const [mode, [unit, texture, framebuffer]] of targets.entries()) {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            gl.uniform1f(this.wearUniforms.mode, mode);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(this.program);
    }

    createTexture(unit) {
        const gl = this.gl;
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }

    uploadTexture(unit, source) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }

    setLabelsVisible(visible) {
        this.labelTarget = visible ? 1 : 0;
        if (!this.animate) {
            this.labelOpacity = this.labelTarget;
            this.render();
        }
    }

    setLines(lines, changedKeys) {
        this.lines = lines;
        if (changedKeys.size > 0) this.flareStartedAt = performance.now();
        this.drawMask(changedKeys);
        if (!this.animate) this.render();
    }

    resize() {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.round(this.canvas.clientWidth * pixelRatio);
        const height = Math.round(this.canvas.clientHeight * pixelRatio);
        this.canvas.width = width;
        this.canvas.height = height;
        this.maskCanvas.width = width;
        this.maskCanvas.height = height;
        this.labelCanvas.width = width;
        this.labelCanvas.height = height;
        this.gl.viewport(0, 0, width, height);
        this.drawMask(new Set());
        if (!this.animate) this.render();
    }

    widestDigit() {
        const context = this.maskContext;
        return Math.max(...'0123456789'.split('').map((digit) => context.measureText(digit).width));
    }

    tabularWidth(text) {
        const digitWidth = this.widestDigit();
        let width = 0;
        for (const character of text) {
            width += /\d/.test(character) ? digitWidth : this.maskContext.measureText(character).width;
        }
        return width;
    }

    segmentWidth(segment) {
        if (segment.slot === undefined) return this.maskContext.measureText(segment.text).width;
        return Math.max(this.tabularWidth(segment.slot), this.tabularWidth(segment.text));
    }

    // Draws the text from the left edge, centering each digit in its own cell for tabular segments.
    drawSegmentText(segment, left, top) {
        const context = this.maskContext;
        if (segment.slot === undefined) {
            context.fillText(segment.text, left, top);
            return;
        }
        const digitWidth = this.widestDigit();
        let x = left + this.segmentWidth(segment) - this.tabularWidth(segment.text);
        for (const character of segment.text) {
            const characterWidth = context.measureText(character).width;
            const cellWidth = /\d/.test(character) ? digitWidth : characterWidth;
            context.fillText(character, x + (cellWidth - characterWidth) / 2, top);
            x += cellWidth;
        }
    }

    lineWidth(line) {
        return line.segments.reduce((sum, segment) => sum + this.segmentWidth(segment), 0);
    }

    // Base size fits the widest line into 80 % of the width (90 % on small screens), capped by the screen height.
    baseFontSize() {
        const { width, height } = this.maskCanvas;
        const context = this.maskContext;
        let widest = 0;
        for (const line of this.lines) {
            context.font = `${line.size * 100}px ${this.fontFamily}`;
            widest = Math.max(widest, this.lineWidth(line) / 100);
        }
        const widthShare = this.canvas.clientWidth >= 1024 ? 0.8 : 0.9;
        return Math.min((width * widthShare) / Math.max(widest, 1), height * 0.15);
    }

    // Labels never get smaller than 11 CSS pixels, so they stay readable on phones.
    labelFontSize(line, base) {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        return Math.max(line.labelSize * base, 11 * pixelRatio);
    }

    // Where the letters really start and end, measured from the top of the line's font box.
    inkExtent(line, base) {
        const context = this.maskContext;
        context.font = `${line.size * base}px ${this.fontFamily}`;
        context.textBaseline = 'top';
        const metrics = context.measureText(line.segments.map((segment) => segment.text).join(''));
        return { top: -metrics.actualBoundingBoxAscent, bottom: metrics.actualBoundingBoxDescent };
    }

    drawMask(changedKeys) {
        const { width, height } = this.maskCanvas;
        const context = this.maskContext;
        // Opaque black background keeps the channels independent when blended with 'lighter'.
        context.globalCompositeOperation = 'source-over';
        context.fillStyle = '#000';
        context.fillRect(0, 0, width, height);
        const labelContext = this.labelContext;
        labelContext.fillStyle = '#000';
        labelContext.fillRect(0, 0, width, height);
        if (this.lines.length === 0) return;

        const base = this.baseFontSize();
        this.glyph = base / height;
        // Every line's letters and labels, measured from the top of the stack of visible letters.
        const layout = [];
        let inkTop = 0;
        for (const [index, line] of this.lines.entries()) {
            // gapBefore is the empty space between the letters or labels of the line above and this line's letters.
            if (index > 0) inkTop += (line.gapBefore ?? LINE_GAP) * base;
            const ink = this.inkExtent(line, base);
            const entry = { line, ink, inkTop, labelSize: 0, labelInk: null };
            let inkBottom = inkTop + ink.bottom - ink.top;
            if (line.labelSize !== undefined) {
                entry.labelSize = this.labelFontSize(line, base);
                labelContext.font = `${entry.labelSize}px ${this.fontFamily}`;
                labelContext.textBaseline = 'top';
                // Labels are capitals, so 'UN' gives every label the same visible top and bottom.
                const metrics = labelContext.measureText('UN');
                entry.labelInk = { top: -metrics.actualBoundingBoxAscent, bottom: metrics.actualBoundingBoxDescent };
                inkBottom += entry.labelSize * LABEL_GAP + entry.labelInk.bottom - entry.labelInk.top;
            }
            layout.push(entry);
            inkTop = inkBottom;
        }
        const stackTop = (height - inkTop) / 2 + height * TEXT_OFFSET;

        context.globalCompositeOperation = 'lighter';
        context.textBaseline = 'top';
        labelContext.fillStyle = 'rgb(210, 0, 0)';
        labelContext.textAlign = 'center';
        for (const { line, ink, inkTop, labelSize, labelInk } of layout) {
            // shift moves a drawn line by a fraction of the screen height without changing the centered layout.
            const lineTop = stackTop + inkTop - ink.top + (line.shift ?? 0) * height;
            const fontSize = line.size * base;
            context.font = `${fontSize}px ${this.fontFamily}`;
            let left = (width - this.lineWidth(line)) / 2;
            const labels = [];

            for (const segment of line.segments) {
                const segmentWidth = this.segmentWidth(segment);
                if (segment.label !== undefined) labels.push({ text: segment.label, center: left + segmentWidth / 2 });
                context.shadowColor = '#0000ff';
                context.shadowBlur = fontSize * 0.4;
                context.fillStyle = '#0000ff';
                this.drawSegmentText(segment, left, lineTop);
                context.shadowBlur = 0;
                context.fillStyle = '#ff0000';
                this.drawSegmentText(segment, left, lineTop);
                if (segment.key !== undefined && changedKeys.has(segment.key)) {
                    context.fillStyle = '#00ff00';
                    this.drawSegmentText(segment, left, lineTop);
                }
                left += segmentWidth;
            }

            // Labels are drawn with R = 210 so they come out slightly see-through below the values.
            if (labelInk !== null) {
                labelContext.font = `${labelSize}px ${this.fontFamily}`;
                const labelTop = lineTop + ink.bottom + labelSize * LABEL_GAP - labelInk.top;
                for (const label of labels) {
                    labelContext.fillText(label.text, label.center, labelTop);
                }
            }
        }

        this.uploadTexture(0, this.maskCanvas);
        this.uploadTexture(1, this.labelCanvas);
        this.drawWear();
    }

    render() {
        const gl = this.gl;
        const now = performance.now();
        // Wrapped so the GPU's 32-bit floats keep the animation smooth when the page stays open for days.
        const time = this.animate ? ((now - this.startedAt) / 1000) % 3600 : 0;
        const flare = this.animate ? Math.exp(-((now - this.flareStartedAt) / 1000) * FLARE_DECAY_PER_SECOND) : 0;
        const fadeStep = (now - this.lastFrameAt) / 1000 / LABEL_FADE_SECONDS;
        this.lastFrameAt = now;
        if (this.labelOpacity < this.labelTarget) this.labelOpacity = Math.min(this.labelTarget, this.labelOpacity + fadeStep);
        if (this.labelOpacity > this.labelTarget) this.labelOpacity = Math.max(this.labelTarget, this.labelOpacity - fadeStep);
        gl.uniform1f(this.uniforms.time, time);
        gl.uniform1f(this.uniforms.flare, flare);
        gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uniforms.glyph, this.glyph);
        gl.uniform1f(this.uniforms.labelOpacity, this.labelOpacity);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    loop() {
        if (!this.gl.isContextLost()) this.render();
        requestAnimationFrame(() => this.loop());
    }
}
