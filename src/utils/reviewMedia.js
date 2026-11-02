export const REVIEW_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
export const REVIEW_PHOTO_MAX_COUNT = 5;
export const REVIEW_VIDEO_MAX_SIZE = 20 * 1024 * 1024;
export const REVIEW_VIDEO_MAX_DURATION_SECONDS = 30;

const REVIEW_IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const REVIEW_VIDEO_EXTENSIONS = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export function getReviewMediaExtension(file, mediaType) {
  const extensions = mediaType === 'video' ? REVIEW_VIDEO_EXTENSIONS : REVIEW_IMAGE_EXTENSIONS;
  return extensions[file.type] || '';
}

export function getReviewVideoDuration(file) {
  const previewUrl = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    let isCleanedUp = false;
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Could not read the video duration. Choose another video.'));
    }, 15000);

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      window.clearTimeout(timeoutId);
      video.onloadedmetadata = null;
      video.onerror = null;
      URL.revokeObjectURL(previewUrl);
      video.removeAttribute('src');
      video.load();
    };

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      if (!Number.isFinite(duration)) {
        reject(new Error('Could not read the video duration. Choose another video.'));
        return;
      }
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('Could not read the video duration. Choose another video.'));
    };
    video.src = previewUrl;
  });
}
