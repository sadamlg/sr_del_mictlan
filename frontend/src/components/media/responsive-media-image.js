import { forwardRef } from 'react';
import { mediaOrigin, mediaRenditionSrcSet } from '../../lib/media-url.js';

const ResponsiveMediaImage = forwardRef(function ResponsiveMediaImage({
  src,
  fallbackSrc = src,
  alt,
  widths,
  sourceWidth,
  sizes,
  width,
  height,
  pictureClassName,
  className,
  ...imageProps
}, ref) {
  const hasRemoteMedia = Boolean(mediaOrigin(src));

  return (
    <picture className={pictureClassName}>
      {hasRemoteMedia && (
        <source
          type="image/webp"
          srcSet={mediaRenditionSrcSet(src, widths, sourceWidth)}
          sizes={sizes}
        />
      )}
      <img
        {...imageProps}
        ref={ref}
        src={fallbackSrc}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        className={className}
      />
    </picture>
  );
});

export default ResponsiveMediaImage;
