/**
 * Cloudflare Worker for 1488.press
 * - High-performance Twitter / X embed fixer for Telegram, Discord, and messaging apps
 * - Native inline video & GIF playback directly inside Telegram and Discord (no navigation to x.com)
 * - Direct media streaming & byte-range proxying
 * - Dual-engine fallback: FixTweet primary + vxTwitter secondary
 * - Full oEmbed and ActivityPub support with custom 1488.press branding
 * - Static website assets served dynamically from GitHub / jsDelivr CDN with Cloudflare Edge caching
 */

// GitHub Repository Configuration
const GITHUB_REPO = 'Dilim0n/1488.press.public';
const GITHUB_BRANCH = 'main';
const GITHUB_FOLDER = '1488.press';

// CDN endpoints: Primary (jsDelivr fast global CDN) + Fallback (raw GitHub)
const CDN_BASE_URL = `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@${GITHUB_BRANCH}/${GITHUB_FOLDER}`;
const RAW_BASE_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_FOLDER}`;

const BOT_USER_AGENTS_REGEX =
  /telegram|discord|twitterbot|whatsapp|facebookexternalhit|facebot|vkshare|slackbot|applebot|bingbot|googlebot|redditbot|linkedinbot|skypeuripreview|iframely|matrix|firefox\/92|preview|crawler|spider|bot|curl|wget/i;

function isCrawler(userAgent) {
  if (!userAgent) return false;
  return BOT_USER_AGENTS_REGEX.test(userAgent);
}

function isMediaRequest(pathname) {
  return (
    /\.(mp4|gif|mov|webm|png|jpe?g|webp)$/i.test(pathname) ||
    pathname.startsWith('/stream') ||
    pathname.startsWith('/dl') ||
    pathname.startsWith('/video') ||
    pathname.startsWith('/2/go')
  );
}

function parseTweetPath(pathname) {
  // Matches:
  // /username/status/123456789
  // /username/status/123456789.mp4
  // /username/status/123456789/video/1
  // /i/status/123456789
  // /status/123456789
  // /123456789
  const statusMatch = pathname.match(/(?:^\/([^/]+))?\/status\/(\d+)(.*)/i);
  if (statusMatch) {
    const username = statusMatch[1] || 'i';
    const statusId = statusMatch[2];
    const rest = statusMatch[3] || '';
    const isDirectMedia = /\.(mp4|gif|mov|webm)$/i.test(rest);
    return {
      username,
      statusId,
      rest,
      isDirectMedia,
      fullPath: '/' + username + '/status/' + statusId + rest
    };
  }

  const numericMatch = pathname.match(/^\/(\d{5,})(.*)/);
  if (numericMatch) {
    const statusId = numericMatch[1];
    const rest = numericMatch[2] || '';
    const isDirectMedia = /\.(mp4|gif|mov|webm)$/i.test(rest);
    return {
      username: 'i',
      statusId,
      rest,
      isDirectMedia,
      fullPath: '/i/status/' + statusId + rest
    };
  }

  return null;
}

/**
 * Unwrap FxTwitter redirect URLs (like https://api.fxtwitter.com/2/go?url=...)
 * directly to the source media URL (video.twimg.com / pbs.twimg.com).
 * This prevents DNS failures since api.1488.press does not exist.
 */
function unwrapMediaUrls(html) {
  // Match https://api.fxtwitter.com/2/go?url=ENCODED_URL or similar
  return html.replace(
    /https?:\/\/(?:api\.)?fxtwitter\.com\/2\/go\?url=([^"'\s&]+)/g,
    (match, encodedUrl) => {
      try {
        return decodeURIComponent(encodedUrl);
      } catch (e) {
        return match;
      }
    }
  );
}

/**
 * Clean and brand HTML for Telegram & Discord native playback
 */
function processEmbedHtml(html, tweet) {
  let processed = unwrapMediaUrls(html);

  // Replace oEmbed endpoint to point back to 1488.press
  processed = processed
    .replace(/https:\/\/fxtwitter\.com\/owoembed/g, 'https://1488.press/owoembed')
    .replace(/https:\/\/fxtwitter\.com\/oembed/g, 'https://1488.press/oembed');

  // Replace canonical and og:url domain if it was fxtwitter
  processed = processed.replace(/https:\/\/fxtwitter\.com/g, 'https://1488.press');

  // Brand with 1488.press and custom theme
  processed = processed
    .replace(/content="FxTwitter"/g, 'content="1488.press"')
    .replace(/content="#6363ff"/g, 'content="#880b24"');

  // Ensure og:site_name has 1488.press
  if (!processed.includes('property="og:site_name"')) {
    processed = processed.replace(
      '</head>',
      '<meta property="og:site_name" content="1488.press"/></head>'
    );
  }

  // Ensure twitter:card is player if video is present, so Discord embeds inline player
  if (processed.includes('property="og:video"') && !processed.includes('name="twitter:card" content="player"')) {
    processed = processed.replace(
      /content="(?:summary_large_image|summary)"\s+name="twitter:card"/g,
      'name="twitter:card" content="player"'
    ).replace(
      /name="twitter:card"\s+content="(?:summary_large_image|summary)"/g,
      'name="twitter:card" content="player"'
    );
  }

  return processed;
}

/**
 * Synthesize HTML embed from vxTwitter data when FixTweet fails
 */
function buildFallbackEmbedHtml(vxData, tweet) {
  const authorName = vxData.user_name || 'Twitter User';
  const authorHandle = vxData.user_screen_name || 'i';
  const text = vxData.text || '';
  const mediaList = vxData.media_extended || [];
  const primaryMedia = mediaList[0] || null;

  const isVideo = primaryMedia && (primaryMedia.type === 'video' || primaryMedia.type === 'gif');
  const isGif = primaryMedia && primaryMedia.type === 'gif';

  let videoTags = '';
  let imageTag = '';
  let cardType = 'summary_large_image';

  if (isVideo) {
    cardType = 'player';
    const videoUrl = primaryMedia.url;
    const thumbUrl = primaryMedia.thumbnail_url || vxData.user_profile_image_url || '';
    const width = primaryMedia.size?.width || 1280;
    const height = primaryMedia.size?.height || 720;

    videoTags = `
    <meta property="twitter:card" content="player" />
    <meta property="twitter:player" content="${videoUrl}" />
    <meta property="twitter:player:width" content="${width}" />
    <meta property="twitter:player:height" content="${height}" />
    <meta property="twitter:player:stream" content="${videoUrl}" />
    <meta property="twitter:player:stream:content_type" content="video/mp4" />
    <meta property="og:type" content="video.other" />
    <meta property="og:video" content="${videoUrl}" />
    <meta property="og:video:secure_url" content="${videoUrl}" />
    <meta property="og:video:type" content="video/mp4" />
    <meta property="og:video:width" content="${width}" />
    <meta property="og:video:height" content="${height}" />
    <meta property="og:image" content="${thumbUrl}" />
    <meta property="twitter:image" content="${thumbUrl}" />
    `;
  } else if (primaryMedia && primaryMedia.type === 'image') {
    imageTag = `
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="og:image" content="${primaryMedia.url}" />
    <meta property="twitter:image" content="${primaryMedia.url}" />
    `;
  } else if (vxData.user_profile_image_url) {
    cardType = 'summary';
    imageTag = `
    <meta property="twitter:card" content="summary" />
    <meta property="og:image" content="${vxData.user_profile_image_url}" />
    <meta property="twitter:image" content="${vxData.user_profile_image_url}" />
    `;
  }

  const siteName = isGif ? '1488.press • GIF' : '1488.press';
  const encodedAuthor = encodeURIComponent(authorHandle);
  const encodedText = encodeURIComponent(text.slice(0, 200));

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <link rel="canonical" href="https://x.com/${authorHandle}/status/${tweet.statusId}" />
    <meta property="og:url" content="https://1488.press/${authorHandle}/status/${tweet.statusId}" />
    <meta property="og:site_name" content="${siteName}" />
    <meta property="theme-color" content="#880b24" />
    <meta property="og:title" content="${authorName} (@${authorHandle})" />
    <meta property="twitter:title" content="${authorName} (@${authorHandle})" />
    <meta property="og:description" content="${text.replace(/"/g, '&quot;')}" />
    <meta property="twitter:description" content="${text.replace(/"/g, '&quot;')}" />
    ${videoTags}
    ${imageTag}
    <link rel="alternate" href="https://1488.press/owoembed?status=${tweet.statusId}&author=${encodedAuthor}&text=${encodedText}" type="application/json+oembed" title="${authorName}" />
    <meta http-equiv="refresh" content="0; url=https://x.com/${authorHandle}/status/${tweet.statusId}" />
</head>
<body>
    <p>Redirecting to post... <a href="https://x.com/${authorHandle}/status/${tweet.statusId}">Click here if not redirected</a></p>
</body>
</html>`;
}

/**
 * Handle direct media streaming and range proxying
 */
async function handleMediaStream(targetUrl, request) {
  try {
    const upstreamHeaders = new Headers();
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      upstreamHeaders.set('Range', rangeHeader);
    }
    upstreamHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    upstreamHeaders.set('Accept', '*/*');

    const upstreamRes = await fetch(targetUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'follow'
    });

    const responseHeaders = new Headers(upstreamRes.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    responseHeaders.set('Cache-Control', 'public, max-age=86400');

    // Ensure content type is video/mp4 for video files
    if (targetUrl.includes('.mp4')) {
      responseHeaders.set('Content-Type', 'video/mp4');
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders
    });
  } catch (e) {
    return Response.redirect(targetUrl, 302);
  }
}

/**
 * Fetch static assets from GitHub / jsDelivr CDN with Cloudflare Edge caching
 */
async function fetchGithubAsset(filename, contentType, cacheControl, edgeTtl = 86400) {
  const cleanFilename = filename.startsWith('/') ? filename.slice(1) : filename;

  // 1. Try jsDelivr CDN (global edge, CORS ready)
  try {
    const cdnUrl = `${CDN_BASE_URL}/${cleanFilename}`;
    const res = await fetch(cdnUrl, {
      cf: {
        cacheEverything: true,
        cacheTtl: edgeTtl
      }
    });

    if (res.ok) {
      const headers = new Headers(res.headers);
      if (contentType) headers.set('Content-Type', contentType);
      if (cacheControl) headers.set('Cache-Control', cacheControl);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(res.body, {
        status: 200,
        headers
      });
    }
  } catch (e) {
    // CDN error, fall back to raw GitHub
  }

  // 2. Fallback to raw GitHub
  try {
    const rawUrl = `${RAW_BASE_URL}/${cleanFilename}`;
    const res = await fetch(rawUrl, {
      cf: {
        cacheEverything: true,
        cacheTtl: edgeTtl
      }
    });

    if (res.ok) {
      const headers = new Headers(res.headers);
      if (contentType) headers.set('Content-Type', contentType);
      if (cacheControl) headers.set('Cache-Control', cacheControl);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(res.body, {
        status: 200,
        headers
      });
    }
  } catch (e) {}

  return new Response(`Asset not found: ${cleanFilename}`, { status: 404 });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const userAgent = request.headers.get('User-Agent') || '';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      });
    }

    // 0. Handle direct media streaming proxy routes (/stream, /dl, /video, /2/go)
    if (pathname.startsWith('/stream') || pathname.startsWith('/dl') || pathname.startsWith('/video') || pathname.startsWith('/2/go')) {
      const targetQueryUrl = url.searchParams.get('url');
      if (targetQueryUrl) {
        return handleMediaStream(targetQueryUrl, request);
      }

      // Upstream proxy to FxTwitter with Host header
      const upstreamUrl = 'https://fxtwitter.com' + pathname + url.search;
      const upstreamHeaders = new Headers(request.headers);
      upstreamHeaders.set('Host', 'fxtwitter.com');
      return fetch(upstreamUrl, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: 'follow'
      });
    }

    // 1. Handle oEmbed endpoints required by Discord and social apps for native video/photo cards
    if (pathname.startsWith('/owoembed') || pathname.startsWith('/oembed')) {
      try {
        const upstreamUrl = 'https://fxtwitter.com' + pathname + url.search;
        const res = await fetch(upstreamUrl, {
          headers: {
            'Host': 'fxtwitter.com',
            'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0)'
          }
        });

        if (res.ok) {
          let text = await res.text();
          text = text
            .replaceAll('FxTwitter', '1488.press')
            .replaceAll('https://fxtwitter.com', 'https://1488.press')
            .replaceAll('fxtwitter.com', '1488.press');

          return new Response(text, {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=3600'
            }
          });
        }
      } catch (e) {}

      // Fallback custom oEmbed response if upstream fails
      const fallbackOembed = {
        type: 'video',
        version: '1.0',
        provider_name: '1488.press',
        provider_url: 'https://1488.press',
        title: url.searchParams.get('text') || 'Twitter / X Post',
        author_name: url.searchParams.get('author') || 'Twitter',
        author_url: `https://x.com/${url.searchParams.get('author') || 'i'}/status/${url.searchParams.get('status') || ''}`
      };

      return new Response(JSON.stringify(fallbackOembed), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    // 2. Handle ActivityPub endpoint for Discord (/api/v1/statuses/...)
    if (pathname.startsWith('/api/v1/statuses/')) {
      try {
        const upstreamUrl = 'https://fxtwitter.com' + pathname;
        const upstreamHeaders = new Headers(request.headers);
        upstreamHeaders.set('Host', 'fxtwitter.com');
        const res = await fetch(upstreamUrl, {
          headers: upstreamHeaders
        });
        if (res.ok) {
          let text = await res.text();
          text = unwrapMediaUrls(text);
          text = text
            .replaceAll('https://fxtwitter.com', 'https://1488.press')
            .replaceAll('fxtwitter.com', '1488.press');
          return new Response(text, {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      } catch (e) {}
    }

    // 3. Handle Twitter / X embeds and redirects
    const tweet = parseTweetPath(pathname);
    if (tweet) {
      // Direct media forced request (e.g., .mp4 or .gif appended to tweet link)
      if (tweet.isDirectMedia) {
        // Query vxTwitter API to obtain direct MP4 video URL
        try {
          const vxRes = await fetch(`https://api.vxtwitter.com/i/status/${tweet.statusId}`);
          if (vxRes.ok) {
            const vxData = await vxRes.json();
            const mediaList = vxData.media_extended || [];
            const videoMedia = mediaList.find(m => m.type === 'video' || m.type === 'gif');
            if (videoMedia && videoMedia.url) {
              return Response.redirect(videoMedia.url, 302);
            }
          }
        } catch (e) {}

        // Fallback: proxy directly to FxTwitter with direct flag
        const cleanStatusPath = `/${tweet.username}/status/${tweet.statusId}`;
        const upstreamHeaders = new Headers();
        upstreamHeaders.set('Host', 'fxtwitter.com');
        upstreamHeaders.set('User-Agent', 'TelegramBot (like TwitterBot)');
        try {
          const fstRes = await fetch(`https://fxtwitter.com${cleanStatusPath}`, {
            headers: upstreamHeaders
          });
          const html = await fstRes.text();
          const videoMatch = html.match(/property="og:video"\s+content="([^"]+)"/i) ||
                             html.match(/content="([^"]+)"\s+property="og:video"/i);
          if (videoMatch && videoMatch[1]) {
            const rawUrl = unwrapMediaUrls(videoMatch[1]);
            return Response.redirect(rawUrl, 302);
          }
        } catch (e) {}
      }

      // Real human clicking link in standard browser -> redirect to X.com
      if (!isCrawler(userAgent) && !isMediaRequest(pathname)) {
        return Response.redirect('https://x.com' + tweet.fullPath + url.search, 302);
      }

      // Messenger / social bot (Telegram, Discord, Twitter, etc.) -> fetch rich embed
      try {
        const cleanPath = `/${tweet.username}/status/${tweet.statusId}`;
        const upstreamHeaders = new Headers();
        upstreamHeaders.set('Host', 'fxtwitter.com');
        // Critical: Using TelegramBot UA triggers FixTweet to output all og:video,
        // og:video:type, and twitter:player tags (which FxTwitter hides for Discordbot)
        upstreamHeaders.set('User-Agent', 'TelegramBot (like TwitterBot)');

        const response = await fetch('https://fxtwitter.com' + cleanPath + url.search, {
          method: 'GET',
          headers: upstreamHeaders
        });

        let html = await response.text();

        // If FixTweet returns valid embed HTML
        if (response.ok && html.includes('<head>') && !html.includes("Sorry, that post doesn't exist")) {
          const processedHtml = processEmbedHtml(html, tweet);
          return new Response(processedHtml, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=3600'
            }
          });
        }
      } catch (e) {
        // Fall through to vxTwitter fallback
      }

      // Secondary fallback: vxTwitter engine
      try {
        const vxRes = await fetch(`https://api.vxtwitter.com/i/status/${tweet.statusId}`);
        if (vxRes.ok) {
          const vxData = await vxRes.json();
          if (vxData && vxData.text !== undefined) {
            const fallbackHtml = buildFallbackEmbedHtml(vxData, tweet);
            return new Response(fallbackHtml, {
              status: 200,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'public, max-age=3600'
              }
            });
          }
        }
      } catch (e) {}

      // If both engines fail, redirect human or bot to original X.com URL
      return Response.redirect('https://x.com' + tweet.fullPath, 302);
    }

    // 4. Serve static website assets directly from GitHub CDN with Cloudflare Edge caching
    if (pathname === '/' || pathname === '/index.html') {
      return fetchGithubAsset('index.html', 'text/html; charset=utf-8', 'public, max-age=60, s-maxage=300', 300);
    }

    if (pathname === '/style.css') {
      return fetchGithubAsset('style.css', 'text/css; charset=utf-8', 'public, max-age=3600, s-maxage=86400', 86400);
    }

    if (pathname === '/main.js') {
      return fetchGithubAsset('main.js', 'application/javascript; charset=utf-8', 'public, max-age=3600, s-maxage=86400', 86400);
    }

    if (pathname === '/minecraft.ttf') {
      return fetchGithubAsset('minecraft.ttf', 'font/ttf', 'public, max-age=31536000, immutable', 604800);
    }

    if (pathname === '/favicon.png' || pathname === '/favicon.ico') {
      return fetchGithubAsset('favicon.png', 'image/png', 'public, max-age=86400, s-maxage=604800', 604800);
    }

    if (pathname === '/og-image.png') {
      return fetchGithubAsset('og-image.png', 'image/png', 'public, max-age=86400, s-maxage=604800', 604800);
    }

    if (pathname === '/COPYRIGHT.txt') {
      return fetchGithubAsset('COPYRIGHT.txt', 'text/plain; charset=utf-8', 'public, max-age=86400', 86400);
    }

    return new Response('Not Found', { status: 404 });
  }
};
