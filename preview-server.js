import { serve } from "bun";
import { join } from "path";
import { existsSync } from "fs";

const PORT = process.env.PORT || 3000;
const BUILD_DIR = existsSync('dist') ? 'dist' : '.vercel/output/static';

if (!existsSync(BUILD_DIR)) {
  console.error(`❌ Build directory ${BUILD_DIR} not found. Run 'bun run build' first.`);
  process.exit(1);
}

const server = serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    
    console.log(`${req.method} - ${path}`);
    
    // Handle routing
    if (path === "/") {
      path = "/index.html";
    }
    
    // Handle SPA routing - serve index.html for non-asset requests
    if (!path.includes('.') && path !== '/index.html') {
      path = "/index.html";
    }
    
    try {
      let filePath = join(BUILD_DIR, path);
      const headers = new Headers();
      
      // Set content types
      if (path.endsWith('.js')) {
        headers.set('Content-Type', 'application/javascript');
      } else if (path.endsWith('.css')) {
        headers.set('Content-Type', 'text/css');
      } else if (path.endsWith('.html')) {
        headers.set('Content-Type', 'text/html');
      } else if (path.endsWith('.json')) {
        headers.set('Content-Type', 'application/json');
      } else if (path.endsWith('.svg')) {
        headers.set('Content-Type', 'image/svg+xml');
      }
      
      // Add security headers
      headers.set('X-Frame-Options', 'ALLOWALL');
      headers.set('Content-Security-Policy', 'frame-ancestors *;');
      
      // Handle gzip compression
      const acceptEncoding = req.headers.get('accept-encoding') || '';
      const shouldCompress = path.match(/\.(js|css|html|json|txt|svg|xml)$/);
      const gzipPath = `${filePath}.gz`;
      
      if (acceptEncoding.includes('gzip') && shouldCompress && existsSync(gzipPath)) {
        const gzipFile = Bun.file(gzipPath);
        headers.set('Content-Encoding', 'gzip');
        headers.set('Vary', 'Accept-Encoding');
        return new Response(gzipFile, { headers });
      }
      
      const file = Bun.file(filePath);
      return file.exists().then(exists => {
        if (exists) {
          return new Response(file, { headers });
        } else {
          // Return 404 with custom page if available
          const notFoundPath = join(BUILD_DIR, '404.html');
          if (existsSync(notFoundPath)) {
            headers.set('Content-Type', 'text/html');
            return new Response(Bun.file(notFoundPath), { 
              status: 404, 
              headers 
            });
          }
          return new Response("Not Found", { status: 404 });
        }
      });
    } catch (error) {
      console.error(`Error serving ${path}:`, error);
      return new Response("Server Error", { status: 500 });
    }
  },
});

console.log(`🚀 Preview server running at http://localhost:${server.port}`);
console.log(`📁 Serving from: ${BUILD_DIR}`);
console.log(`📊 Press Ctrl+C to stop`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down preview server...');
  server.stop();
  process.exit(0);
}); 