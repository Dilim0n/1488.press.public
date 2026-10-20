/**
 * Cloudflare Worker for 1488.press
 * - Twitter / X native embed fixer for Telegram, Discord, and messaging apps
 * - Video / GIF stream & download proxy for native Discord & Telegram playback
 * - oEmbed provider for rich social media cards
 * - Static website assets served dynamically from GitHub / jsDelivr CDN with Cloudflare Edge caching
 */

// GitHub Repository Configuration
const GITHUB_REPO = 'Dilim0n/1488.press.public';
const GITHUB_BRANCH = 'main';
const GITHUB_FOLDER = '1488.press';

// CDN endpoints: Primary (jsDelivr fast global CDN) + Fallback (raw GitHub)
const CDN_BASE_URL = `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@${GITHUB_BRANCH}/${GITHUB_FOLDER}`;
const RAW_BASE_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_FOLDER}`;

const BOT_USER_AGENTS = [
  'telegrambot',
  'twitterbot',
  'discordbot',
  'whatsapp',
  'facebookexternalhit',
  'facebot',
  'vkshare',
  'slackbot',
  'applebot',
  'bingbot',
  'googlebot',
  'redditbot',
  'linkedinbot'
];

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some(bot => ua.includes(bot));
}

function parseTweetPath(pathname) {
  // Matches:
  // /username/status/123456789
  // /username/status/123456789/video/1
  // /username/status/123456789/photo/2
  // /i/status/123456789
  // /status/123456789
  // /123456789
  const statusMatch = pathname.match(/(?:^\/([^/]+))?\/status\/(\d+)(.*)/i);
  if (statusMatch) {
    return {
      username: statusMatch[1] || 'i',
      statusId: statusMatch[2],
      fullPath: '/' + (statusMatch[1] || 'i') + '/status/' + statusMatch[2] + (statusMatch[3] || '')
    };
  }

  const numericMatch = pathname.match(/^\/(\d{5,})(.*)/);
  if (numericMatch) {
    return {
      username: 'i',
      statusId: numericMatch[1],
      fullPath: '/i/status/' + numericMatch[1] + (numericMatch[2] || '')
    };
  }

  return null;
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

    // 0. Handle media proxy / direct stream / download routes (required for native video/GIF in Discord & Telegram)
    if (pathname.startsWith('/stream/') || pathname.startsWith('/dl/')) {
      const upstreamUrl = 'https://fxtwitter.com' + pathname + url.search;
      return fetch(upstreamUrl, {
        method: request.method,
        headers: request.headers,
        redirect: 'follow'
      });
    }

    // 1. Handle oEmbed endpoints required by Discord for native video/photo cards
    if (pathname.startsWith('/owoembed') || pathname.startsWith('/oembed')) {
      try {
        const upstreamUrl = 'https://fxtwitter.com' + pathname + url.search;
        const res = await fetch(upstreamUrl, {
          headers: {
            'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 (compatible; Discordbot/2.0)'
          }
        });
        let text = await res.text();
        text = text
          .replaceAll('FxTwitter', '1488.press')
          .replaceAll('https://fxtwitter.com', 'https://1488.press')
          .replaceAll('fxtwitter.com', '1488.press');

        return new Response(text, {
          status: res.status,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      } catch (e) {
        return new Response('{}', {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 2. Handle Twitter / X embeds and redirects
    const tweet = parseTweetPath(pathname);
    if (tweet) {
      const userAgent = request.headers.get('User-Agent') || '';

      // Real human in browser -> redirect to X.com
      if (!isBot(userAgent)) {
        return Response.redirect('https://x.com' + tweet.fullPath + url.search, 302);
      }

      // Messenger / social bot (Telegram, Discord, Twitter, etc.) -> fetch rich embed
      try {
        const upstreamUrl = 'https://fxtwitter.com' + tweet.fullPath + url.search;
        const upstreamHeaders = new Headers(request.headers);
        upstreamHeaders.set('Host', 'fxtwitter.com');

        const response = await fetch(upstreamUrl, {
          method: request.method,
          headers: upstreamHeaders
        });

        let html = await response.text();

        // Brand with 1488.press and ensure oembed & media point back to 1488.press
        html = html
          .replaceAll('https://fxtwitter.com', 'https://1488.press')
          .replaceAll('fxtwitter.com', '1488.press')
          .replaceAll('content="FxTwitter"', 'content="1488.press"')
          .replaceAll('content="#6363ff"', 'content="#880b24"');

        return new Response(html, {
          status: response.status,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      } catch (e) {
        return Response.redirect('https://x.com' + tweet.fullPath, 302);
      }
    }

    // 3. Serve static website assets directly from GitHub CDN with Cloudflare Edge caching
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
