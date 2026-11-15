import React from 'react';
import { getMaterialIconPath } from '../../utils/materialIconPaths';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  name?: string;
  children?: React.ReactNode;
  className?: string;
  size?: number | string;
  filled?: boolean;
}

/**
 * Universal Google Material Symbols & Icons inline SVG component.
 * Standard dimensions: 24px x 24px, viewBox 0 -960 960 960, fill currentColor.
 * Preserves all HTML/SVG attributes (id, class, style, onClick, etc.).
 * Supports both `name="search"` and children `<Icon>search</Icon>`.
 */
export const Icon: React.FC<IconProps> = ({
  name,
  children,
  className = '',
  size,
  filled,
  style,
  width,
  height,
  ...props
}) => {
  let resolvedName = name;
  if (!resolvedName && children !== undefined && children !== null) {
    if (typeof children === 'string' || typeof children === 'number') {
      resolvedName = String(children);
    } else if (Array.isArray(children)) {
      resolvedName = children
        .flat(Infinity)
        .filter((c) => typeof c === 'string' && c.trim().length > 0)
        .join('')
        .trim();
    }
  }

  const pathData = getMaterialIconPath(resolvedName || '');

  const isNumericSize = typeof size === 'number';
  const calculatedSize = size
    ? (isNumericSize ? `calc(${size}px * var(--ui-scale, 1))` : size)
    : undefined;

  const finalWidth = width || calculatedSize;
  const finalHeight = height || calculatedSize;

  const svgAttrWidth = width || (isNumericSize ? '1em' : calculatedSize) || '1em';
  const svgAttrHeight = height || (isNumericSize ? '1em' : calculatedSize) || '1em';

  const resolvedFontSize = finalHeight || calculatedSize;
  const combinedStyle: React.CSSProperties = {
    ...(resolvedFontSize ? { fontSize: resolvedFontSize } : {}),
    ...(finalWidth ? { width: finalWidth } : {}),
    ...(finalHeight ? { height: finalHeight } : {}),
    ...style,
  };

  const { key, ...restProps } = props as any;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height={svgAttrHeight}
      width={svgAttrWidth}
      viewBox="0 -960 960 960"
      fill="currentColor"
      className={`material-symbols-outlined inline-block shrink-0 align-middle ${className}`}
      style={combinedStyle}
      aria-hidden="true"
      {...restProps}
    >
      <path d={pathData} />
    </svg>
  );
};
