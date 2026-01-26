import { splitFloat64 } from "../../helpers/utility.js";
import { WEBGL_CONFIG } from "./constants";

class MutationPoints {
  constructor(regl, gapX, gapY) {
    this.regl = regl;
    this.gap = gapX;
    this.offsetY = gapY;
    this.pointSize = WEBGL_CONFIG.POINT_SIZE;

    this.dataY = null;
    this.color = null;
    this.shapeType = null;
    this.opacity = null;
    this.highlight = null;
    this.instances = 0;
    this.width = 1;
    this.height = 1;
    this.highlightedIndex = -1;

    const shapeSDFCode = `
      float sdCircle(vec2 p) {
        return length(p) - 1.0;
      }

      float sdDiamond(vec2 p) {
        return (abs(p.x) + abs(p.y)) - 1.0;
      }

      float sdTriangle(vec2 p) {
        p.y = -p.y;
        p.y -= 0.33;
        float d1 = p.y + 0.5;
        float d2 = -0.866 * p.x - 0.5 * p.y + 0.5;
        float d3 = 0.866 * p.x - 0.5 * p.y + 0.5;
        return -min(min(d1, d2), d3);
      }

      float getShapeDist(vec2 p, float shape) {
        if (shape < 0.5) {
          return sdCircle(p);
        } else if (shape < 1.5) {
          return sdDiamond(p);
        } else {
          return sdTriangle(p);
        }
      }
    `;

    this.drawCommand = regl({
      frag: `
        precision highp float;
        varying vec4 vColor;
        varying float vOpacity;
        varying vec2 vPos;
        varying float vShape;
        varying float vHighlight;
        uniform float windowWidth;

        ${shapeSDFCode}

        void main() {
          vec2 p = 2.0 * gl_PointCoord - 1.0;

          if (vPos.x < 0.0 || vPos.x > windowWidth) {
            discard;
          }

          float dist = getShapeDist(p, vShape);

          if (dist > 0.0) {
            discard;
          }

          float alpha = smoothstep(0.0, -0.1, dist);

          // Highlight border: orange stroke for highlighted points
          if (vHighlight > 0.5 && dist > -0.35) {
            // Orange color: rgb(255, 127, 14)
            gl_FragColor = vec4(1.0, 0.498, 0.055, alpha);
          } else {
            gl_FragColor = vec4(vColor.rgb, vOpacity * alpha);
          }
        }
      `,

      vert: `
        precision highp float;
        attribute vec2 position;
        attribute float dataY, color, shapeType, opacity, sizeMultiplier, highlight;
        attribute float dataXHigh, dataXLow;

        varying vec4 vColor;
        varying float vOpacity;
        varying vec2 vPos;
        varying float vShape;
        varying float vHighlight;

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

          float z = clip.x * 0.5 + 0.5;

          gl_PointSize = pointSize * sizeMultiplier;
          gl_Position = vec4(clip, z, 1.0);

          float red   = floor(color / 65536.0);
          float green = floor((color - red * 65536.0) / 256.0);
          float blue  = color - red * 65536.0 - green * 256.0;
          vColor = vec4(red / 255.0, green / 255.0, blue / 255.0, 1.0);

          vOpacity = opacity;
          vShape = shapeType;
          vHighlight = highlight;
        }
      `,

      attributes: {
        position: [[0.0, 0.0]],
        dataXHigh: { buffer: regl.prop("dataXHigh"), divisor: 1 },
        dataXLow: { buffer: regl.prop("dataXLow"), divisor: 1 },
        dataY: { buffer: regl.prop("dataY"), divisor: 1 },
        color: { buffer: regl.prop("color"), divisor: 1 },
        shapeType: { buffer: regl.prop("shapeType"), divisor: 1 },
        opacity: { buffer: regl.prop("opacity"), divisor: 1 },
        sizeMultiplier: { buffer: regl.prop("sizeMultiplier"), divisor: 1 },
        highlight: { buffer: regl.prop("highlight"), divisor: 1 },
      },

      primitive: "points",
      count: 1,
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

      depth: {
        enable: true,
        mask: true,
        func: "less",
        range: [0, 1],
      },
      blend: {
        enable: true,
        func: {
          srcRGB: "src alpha",
          srcAlpha: "one",
          dstRGB: "one minus src alpha",
          dstAlpha: "one",
        },
        equation: { rgb: "add", alpha: "add" },
      },
    });
  }

  setData(dataPointsXHigh, dataPointsXLow, dataPointsY, dataPointsColor, dataPointsShape, dataPointsOpacity, dataPointsSize) {
    this.destroyBuffers();
    this.dataXHigh = this.regl.buffer(dataPointsXHigh);
    this.dataXLow = this.regl.buffer(dataPointsXLow);
    this.dataY = this.regl.buffer(dataPointsY);
    this.color = this.regl.buffer(dataPointsColor);
    this.shapeType = this.regl.buffer(dataPointsShape);
    this.opacity = this.regl.buffer(dataPointsOpacity);
    this.sizeMultiplier = this.regl.buffer(dataPointsSize);
    // Initialize highlight buffer with all zeros
    this.highlightData = new Float32Array(dataPointsColor.length);
    this.highlight = this.regl.buffer(this.highlightData);
    this.instances = dataPointsColor.length;
    this.highlightedIndex = -1;
  }

  setHighlight(index) {
    if (this.highlightedIndex === index) return;
    
    // Clear previous highlight
    if (this.highlightedIndex >= 0 && this.highlightedIndex < this.highlightData.length) {
      this.highlightData[this.highlightedIndex] = 0.0;
    }
    
    // Set new highlight
    if (index >= 0 && index < this.highlightData.length) {
      this.highlightData[index] = 1.0;
    }
    
    this.highlightedIndex = index;
    
    // Update buffer
    if (this.highlight) {
      this.highlight.subdata(this.highlightData);
    }
  }

  clearHighlight() {
    this.setHighlight(-1);
  }

  updateDomains(width, height, domains, yDomain) {
    this.width = width;
    this.height = height;

    const windowWidth =
      (width - (domains.length - 1) * this.gap) / domains.length;
    const windowHeight = height;

    this.dataBufferList = domains.map((domainX, i) => {
      const kx = windowWidth / (domainX[1] - domainX[0]);
      const ky = -windowHeight / (yDomain[1] - yDomain[0]);
      const ty = windowHeight - ky * yDomain[0];

      const [kxHigh, kxLow] = splitFloat64(kx);
      const [domainX0High, domainX0Low] = splitFloat64(domainX[0]);

      return {
        dataXHigh: this.dataXHigh,
        dataXLow: this.dataXLow,
        dataY: this.dataY,
        color: this.color,
        shapeType: this.shapeType,
        opacity: this.opacity,
        sizeMultiplier: this.sizeMultiplier,
        highlight: this.highlight,
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
      };
    });
  }

  render() {
    if (!this.dataBufferList || this.instances === 0) return;

    try {
      this.regl.clear({
        color: [0, 0, 0, 0],
        depth: 1,
        stencil: false,
      });
      this.regl.poll();
      this.drawCommand(this.dataBufferList);
    } catch (err) {
      console.error(`MutationPoints WebGL rendering failed: ${err}`);
    }
  }

  destroyBuffers() {
    if (this.dataXHigh) {
      this.dataXHigh.destroy();
      this.dataXHigh = null;
    }
    if (this.dataXLow) {
      this.dataXLow.destroy();
      this.dataXLow = null;
    }
    if (this.dataY) {
      this.dataY.destroy();
      this.dataY = null;
    }
    if (this.color) {
      this.color.destroy();
      this.color = null;
    }
    if (this.shapeType) {
      this.shapeType.destroy();
      this.shapeType = null;
    }
    if (this.opacity) {
      this.opacity.destroy();
      this.opacity = null;
    }
    if (this.sizeMultiplier) {
      this.sizeMultiplier.destroy();
      this.sizeMultiplier = null;
    }
    if (this.highlight) {
      this.highlight.destroy();
      this.highlight = null;
    }
    this.highlightData = null;
    this.highlightedIndex = -1;
  }

  destroy() {
    this.destroyBuffers();
  }
}

export default MutationPoints;
