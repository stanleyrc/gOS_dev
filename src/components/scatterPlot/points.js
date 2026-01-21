import { splitFloat64 } from "../../helpers/utility.js";

class Points {
  constructor(regl, gapX, gapY) {
    this.regl = regl;
    this.gap = gapX;
    this.offsetY = gapY;
    this.pointSize = 10;

    this.dataY = null;
    this.color = null;
    this.instances = 0;
    this.width = 1;
    this.height = 1;

    this.densityTexture = regl.texture({
      width: 1,
      height: 1,
      type: "float",
      format: "rgba",
      min: "linear",
      mag: "linear",
    });

    this.densityFBO = regl.framebuffer({
      color: this.densityTexture,
      depth: false,
      stencil: false,
    });

    const positions = [[0.0, 0.0]];

    this.densityCommand = regl({
      frag: `
        precision highp float;
        varying vec2 vPos;
        uniform float windowWidth;
        void main() {
          vec2 cxy = 2.0 * gl_PointCoord - 1.0;
          float r = dot(cxy, cxy);
          if (vPos.x < 0.0 || vPos.x > windowWidth || r > 1.0) {
            discard;
          }
          gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        }
      `,

      vert: `
        precision highp float;
        attribute vec2 position;
        attribute float dataY;
        attribute float dataXHigh, dataXLow;

        varying vec2 vPos;

        uniform float kxHigh, kxLow, ky;
        uniform float domainX0High, domainX0Low;
        uniform float ty;
        uniform float stageWidth, stageHeight;
        uniform float pointSize;
        uniform float offsetX, offsetY;

        float mul64(float aHigh, float aLow, float bHigh, float bLow) {
          float high = aHigh * bHigh;
          float cross = aHigh * bLow + aLow * bHigh;
          return high + cross;
        }

        void sub64(in float aHigh, in float aLow,
                   in float bHigh, in float bLow,
                   out float resHigh, out float resLow) {
          float s = aHigh - bHigh;
          float v = s - aHigh;
          float t = ((-bHigh - v) + (aHigh - (s - v))) + (aLow - bLow);
          resHigh = s;
          resLow  = t;
        }

        vec2 normalizeCoords(vec2 xy) {
          return vec2(
            2.0 * ((xy.x / stageWidth) - 0.5),
            -(2.0 * ((xy.y / stageHeight) - 0.5))
          );
        }

        void main() {
          float diffHigh, diffLow;
          sub64(dataXHigh, dataXLow, domainX0High, domainX0Low, diffHigh, diffLow);

          float posX = mul64(diffHigh, diffLow, kxHigh, kxLow);
          float posY = ky * dataY + ty;

          float vecX = position.x + posX;
          float vecY = position.y + posY;
          vPos = vec2(vecX, vecY);

          vec2 clip = normalizeCoords(vec2(vecX + offsetX, vecY - offsetY));
          clip.y = clamp(clip.y, -1.0, 1.0);

          gl_PointSize = pointSize;
          gl_Position = vec4(clip, 0.0, 1.0);
        }
      `,

      attributes: {
        position: positions,
        dataXHigh: { buffer: regl.prop("dataXHigh"), divisor: 1 },
        dataXLow: { buffer: regl.prop("dataXLow"), divisor: 1 },
        dataY: { buffer: regl.prop("dataY"), divisor: 1 },
      },

      primitive: "points",
      count: positions.length,
      instances: regl.prop("instances"),

      uniforms: {
        kxHigh: regl.prop("kxHigh"),
        kxLow: regl.prop("kxLow"),
        ky: regl.prop("ky"),
        ty: regl.prop("ty"),
        domainX0High: regl.prop("domainX0High"),
        domainX0Low: regl.prop("domainX0Low"),
        windowWidth: regl.prop("windowWidth"),
        stageWidth: regl.prop("width"),
        stageHeight: regl.prop("height"),
        pointSize: regl.prop("pointSize"),
        offsetX: regl.prop("offsetX"),
        offsetY: regl.prop("offsetY"),
      },

      framebuffer: regl.prop("densityFBO"),

      depth: { enable: false },
      blend: {
        enable: true,
        func: {
          srcRGB: "one",
          srcAlpha: "one",
          dstRGB: "one",
          dstAlpha: "one",
        },
        equation: { rgb: "add", alpha: "add" },
      },
    });

    this.drawCommand = regl({
      frag: `
        precision highp float;
        varying vec4 vColor;
        varying vec2 vPos;
        varying vec2 vTexCoord;
        uniform float windowWidth;
        uniform sampler2D densityTexture;
        uniform float maxDensity;
        void main() {
          vec2 cxy = 2.0 * gl_PointCoord - 1.0;
          float r = dot(cxy, cxy);
          if (vPos.x < 0.0 || vPos.x > windowWidth || r > 1.0) {
            discard;
          }

          float density = max(1.0, texture2D(densityTexture, vTexCoord).r);
          float blend = 1.0 - pow(0.5, density);

          gl_FragColor = vec4(vColor.rgb * blend, blend);
        }
      `,

      vert: `
        precision highp float;
        attribute vec2 position;
        attribute float dataY, color;
        attribute float dataXHigh, dataXLow;

        varying vec4 vColor;
        varying vec2 vPos;
        varying vec2 vTexCoord;

        uniform float kxHigh, kxLow, ky;
        uniform float domainX0High, domainX0Low;
        uniform float ty;
        uniform float stageWidth, stageHeight;
        uniform float pointSize;
        uniform float offsetX, offsetY;

        float mul64(float aHigh, float aLow, float bHigh, float bLow) {
          float high = aHigh * bHigh;
          float cross = aHigh * bLow + aLow * bHigh;
          return high + cross;
        }

        void sub64(in float aHigh, in float aLow,
                   in float bHigh, in float bLow,
                   out float resHigh, out float resLow) {
          float s = aHigh - bHigh;
          float v = s - aHigh;
          float t = ((-bHigh - v) + (aHigh - (s - v))) + (aLow - bLow);
          resHigh = s;
          resLow  = t;
        }

        vec2 normalizeCoords(vec2 xy) {
          return vec2(
            2.0 * ((xy.x / stageWidth) - 0.5),
            -(2.0 * ((xy.y / stageHeight) - 0.5))
          );
        }

        void main() {
          float diffHigh, diffLow;
          sub64(dataXHigh, dataXLow, domainX0High, domainX0Low, diffHigh, diffLow);

          float posX = mul64(diffHigh, diffLow, kxHigh, kxLow);
          float posY = ky * dataY + ty;

          float vecX = position.x + posX;
          float vecY = position.y + posY;
          vPos = vec2(vecX, vecY);

          vec2 clip = normalizeCoords(vec2(vecX + offsetX, vecY - offsetY));
          clip.y = clamp(clip.y, -1.0, 1.0);

          vTexCoord = vec2(clip.x * 0.5 + 0.5, clip.y * 0.5 + 0.5);

          float z = clip.x * 0.5 + 0.5;

          gl_PointSize = pointSize;
          gl_Position = vec4(clip, z, 1.0);

          float red   = floor(color / 65536.0);
          float green = floor((color - red * 65536.0) / 256.0);
          float blue  = color - red * 65536.0 - green * 256.0;
          vColor = vec4(red / 255.0, green / 255.0, blue / 255.0, 1.0);
        }
      `,

      attributes: {
        position: positions,
        dataXHigh: { buffer: regl.prop("dataXHigh"), divisor: 1 },
        dataXLow: { buffer: regl.prop("dataXLow"), divisor: 1 },
        dataY: { buffer: regl.prop("dataY"), divisor: 1 },
        color: { buffer: regl.prop("color"), divisor: 1 },
      },

      primitive: "points",
      count: positions.length,
      instances: regl.prop("instances"),

      uniforms: {
        kxHigh: regl.prop("kxHigh"),
        kxLow: regl.prop("kxLow"),
        ky: regl.prop("ky"),
        ty: regl.prop("ty"),
        domainX0High: regl.prop("domainX0High"),
        domainX0Low: regl.prop("domainX0Low"),
        windowWidth: regl.prop("windowWidth"),
        stageWidth: regl.prop("width"),
        stageHeight: regl.prop("height"),
        pointSize: regl.prop("pointSize"),
        offsetX: regl.prop("offsetX"),
        offsetY: regl.prop("offsetY"),
        densityTexture: regl.prop("densityTexture"),
        maxDensity: regl.prop("maxDensity"),
      },

      depth: {
        enable: true,
        mask: true,
        func: "less",
        range: [0, 1],
      },
      blend: {
        enable: true,
        func: {
          srcRGB: "one",
          srcAlpha: "one",
          dstRGB: "one minus src alpha",
          dstAlpha: "one",
        },
        equation: { rgb: "add", alpha: "add" },
      },
    });

    this.maxDensity = 50.0;
  }

  setData(dataPointsXHigh, dataPointsXLow, dataPointsY, dataPointsColor) {
    this.dataXHigh = this.regl.buffer(dataPointsXHigh);
    this.dataXLow = this.regl.buffer(dataPointsXLow);
    this.dataY = this.regl.buffer(dataPointsY);
    this.color = this.regl.buffer(dataPointsColor);
    this.instances = dataPointsColor.length;
  }

  updateDomains(width, height, domains, maxYValues) {
    if (this.width !== width || this.height !== height) {
      this.width = width;
      this.height = height;

      this.densityTexture({
        width: width,
        height: height,
        type: "float",
        format: "rgba",
        min: "linear",
        mag: "linear",
      });

      this.densityFBO({
        color: this.densityTexture,
        depth: false,
        stencil: false,
      });
    }

    const windowWidth =
      (width - (domains.length - 1) * this.gap) / domains.length;
    const windowHeight = height;

    this.dataBufferList = domains.map((domainX, i) => {
      const domainY = [0, maxYValues[i]];
      const kx = windowWidth / (domainX[1] - domainX[0]);
      const ky = -windowHeight / (domainY[1] - domainY[0]);
      const ty = windowHeight - ky * domainY[0];

      const [kxHigh, kxLow] = splitFloat64(kx);
      const [domainX0High, domainX0Low] = splitFloat64(domainX[0]);

      return {
        dataXHigh: this.dataXHigh,
        dataXLow: this.dataXLow,
        dataY: this.dataY,
        color: this.color,
        instances: this.instances,
        kxHigh,
        kxLow,
        ky,
        ty,
        domainX0High,
        domainX0Low,
        windowWidth,
        width,
        height,
        pointSize: this.pointSize,
        offsetX: i * (this.gap + windowWidth),
        offsetY: this.offsetY,
        densityFBO: this.densityFBO,
        densityTexture: this.densityTexture,
        maxDensity: this.maxDensity,
      };
    });
  }

  render() {
    try {
      this.regl.clear({
        color: [0, 0, 0, 0],
        depth: false,
        stencil: false,
        framebuffer: this.densityFBO,
      });
      this.densityCommand(this.dataBufferList);

      this.regl.clear({
        color: [0, 0, 0, 0],
        depth: 1,
        stencil: false,
      });
      this.regl.poll();
      this.drawCommand(this.dataBufferList);
    } catch (err) {
      console.error(`Scatterplot WebGL rendering failed: ${err}`);
    }
  }

  setMaxDensity(maxDensity) {
    this.maxDensity = maxDensity;
    if (this.dataBufferList) {
      this.dataBufferList.forEach((d) => (d.maxDensity = maxDensity));
    }
  }
}

export default Points;
