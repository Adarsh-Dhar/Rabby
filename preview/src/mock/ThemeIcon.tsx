import React from 'react';

/**
 * Stub of `ThemeIcon`, which normally swaps a light/dark SVG variant. For the
 * preview it just renders whatever component (`src`) it is given, forwarding
 * className/style so Tailwind sizing utilities still apply.
 */
type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

const ThemeIcon: React.FC<
  { src: IconComponent } & React.HTMLAttributes<HTMLElement>
> = ({ src: Src, ...rest }) => <Src {...(rest as any)} />;

export default ThemeIcon;
