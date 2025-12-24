import React, { Component } from "react";
import { measureText } from "../../helpers/utility";

class PlotTooltip extends Component {
  static TOOLTIP_WIDTH = 300;
  static PADDING = 10;
  static LINE_HEIGHT = 16;
  static FONT_SIZE = 11;

  wrapTextWithLabel(label, value) {
    const textStr = String(value);
    if (!textStr || textStr.length === 0) return [{ hasLabel: true, text: "" }];
    
    const maxWidth = PlotTooltip.TOOLTIP_WIDTH - PlotTooltip.PADDING * 2 - 10; // extra buffer
    const labelPrefix = `${label}: `;
    const labelWidth = measureText(labelPrefix, PlotTooltip.FONT_SIZE);
    
    const words = textStr.split(" ");
    const lines = [];
    let currentLine = "";
    let isFirstLine = true;
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const availableWidth = isFirstLine ? (maxWidth - labelWidth) : maxWidth;
      const width = measureText(testLine, PlotTooltip.FONT_SIZE);
      
      if (width > availableWidth && currentLine) {
        // Current line is full, push it and start new line
        lines.push({ hasLabel: isFirstLine, text: currentLine });
        currentLine = word;
        isFirstLine = false;
      } else if (width > availableWidth && !currentLine) {
        // Single word exceeds width - force it on its own line
        lines.push({ hasLabel: isFirstLine, text: word });
        currentLine = "";
        isFirstLine = false;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push({ hasLabel: isFirstLine, text: currentLine });
    }
    
    return lines.length > 0 ? lines : [{ hasLabel: true, text: textStr }];
  }

  render() {
    const { visible, x, y, text } = this.props;

    if (!visible || !text || text.length === 0) {
      return null;
    }

    const { TOOLTIP_WIDTH, PADDING, LINE_HEIGHT, FONT_SIZE } = PlotTooltip;

    // Pre-compute all wrapped lines
    const allItems = text.map((item) => ({
      label: item.label,
      lines: this.wrapTextWithLabel(item.label, item.value),
    }));

    // Calculate total height
    const totalLines = allItems.reduce((sum, item) => sum + item.lines.length, 0);
    const totalHeight = PADDING + totalLines * LINE_HEIGHT + (text.length - 1) * 4 + PADDING;

    // Render lines
    let currentY = PADDING + LINE_HEIGHT - 4;

    return (
      <g transform={`translate(${x}, ${y})`} pointerEvents="none">
        <rect
          x={0}
          y={0}
          width={TOOLTIP_WIDTH}
          height={totalHeight}
          rx={5}
          ry={5}
          fill="rgb(97, 97, 97)"
          fillOpacity={0.9}
        />
        {allItems.map((item, itemIdx) => {
          const elements = item.lines.map((lineObj, lineIdx) => {
            const yPos = currentY;
            currentY += LINE_HEIGHT;
            
            return (
              <text
                key={`${itemIdx}-${lineIdx}`}
                x={PADDING}
                y={yPos}
                fontSize={FONT_SIZE}
                fill="#FFF"
              >
                {lineObj.hasLabel && <tspan fontWeight="bold">{item.label}: </tspan>}
                {lineObj.text}
              </text>
            );
          });
          
          // Add spacing between items
          if (itemIdx < allItems.length - 1) {
            currentY += 4;
          }
          
          return elements;
        })}
      </g>
    );
  }
}

export default PlotTooltip;
