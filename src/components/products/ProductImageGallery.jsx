import { useState } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';

function getProductImageUrls(product) {
  const imageUrls = Array.isArray(product?.imageUrls)
    ? product.imageUrls.filter((url) => typeof url === 'string' && url)
    : [];
  if (imageUrls.length) return imageUrls.slice(0, 10);
  return product?.image ? [product.image] : [];
}

export default function ProductImageGallery({ product, className = '' }) {
  const images = getProductImageUrls(product);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex = Math.min(selectedIndex, Math.max(images.length - 1, 0));
  const activeImage = images[activeIndex];

  if (!activeImage) {
    return (
      <div className={`product-image-gallery product-image-gallery-empty ${className}`.trim()} aria-label="No product photos">
        <ImageIcon size={34} aria-hidden="true" />
        <span>No product photos</span>
      </div>
    );
  }

  const selectImage = (index) => setSelectedIndex((index + images.length) % images.length);

  return (
    <div className={`product-image-gallery ${className}`.trim()}>
      <div className="product-image-gallery-main">
        <img src={activeImage} alt={`${product.name} photo ${activeIndex + 1} of ${images.length}`} />
        {images.length > 1 ? (
          <>
            <button type="button" className="product-image-gallery-arrow is-previous" onClick={() => selectImage(activeIndex - 1)} aria-label="Previous product photo">
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button type="button" className="product-image-gallery-arrow is-next" onClick={() => selectImage(activeIndex + 1)} aria-label="Next product photo">
              <ChevronRight size={20} aria-hidden="true" />
            </button>
            <span className="product-image-gallery-count">{activeIndex + 1}/{images.length}</span>
          </>
        ) : null}
      </div>
      {images.length > 1 ? (
        <div className="product-image-gallery-thumbnails" aria-label="Product photos">
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              className={`product-image-gallery-thumbnail${index === activeIndex ? ' is-active' : ''}`}
              onClick={() => selectImage(index)}
              aria-label={`Show product photo ${index + 1}`}
              aria-pressed={index === activeIndex}
            >
              <img src={image} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
