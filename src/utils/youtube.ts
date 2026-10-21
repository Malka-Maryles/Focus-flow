export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const cleanUrl = url.trim();

  // Pattern for youtu.be/ID
  const shortMatch = cleanUrl.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch && shortMatch[1]) {
    return shortMatch[1];
  }

  // Pattern for youtube.com/watch?v=ID or youtube.com/embed/ID or youtube.com/v/ID
  const longMatch = cleanUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (longMatch && longMatch[1]) {
    return longMatch[1];
  }

  const embedMatch = cleanUrl.match(/youtube\.com\/(?:embed|v)\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch && embedMatch[1]) {
    return embedMatch[1];
  }

  return null;
}

export function getYouTubeEmbedUrl(url: string): string | null {
  const id = extractYouTubeId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}
