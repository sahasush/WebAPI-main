import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express) {
  // Try multiple possible paths for different deployment environments
  const possiblePaths = [
    path.resolve(import.meta.dirname, "public"),           // Local build
    path.resolve(process.cwd(), "dist", "public"),         // Standard deployment
    "/app/dist/public"                                     // Render.com path
  ];
  
  let distPath = "";
  for (const tryPath of possiblePaths) {
    if (fs.existsSync(tryPath)) {
      distPath = tryPath;
      break;
    }
  }

  if (!distPath || !fs.existsSync(distPath)) {
    const error = `Could not find build directory. Tried: ${possiblePaths.join(", ")}`;
    log(error);
    throw new Error(error);
  }

  log(`Serving static files from: ${distPath}`);

  // Serve static files first
  app.use(express.static(distPath, {
    // Add fallthrough option to ensure 404s for missing static files get to SPA handler
    fallthrough: true,
    index: false  // Don't serve index.html automatically for directories
  }));

  // SPA fallback: serve index.html for all non-API, non-static routes
  app.use((req, res, next) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith("/api/")) {
      log(`API route not handled: ${req.path}`);
      return res.status(404).json({ error: "API route not found" });
    }
    
    // Skip for static assets
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      log(`Static asset not found: ${req.path}`);
      return res.status(404).send("Asset not found");
    }
    
    const indexPath = path.resolve(distPath, "index.html");
    
    // Check if index.html exists
    if (!fs.existsSync(indexPath)) {
      log(`ERROR: Index file not found at: ${indexPath}`);
      log(`Available files in ${distPath}: ${fs.readdirSync(distPath).join(", ")}`);
      return res.status(500).send("Application not built properly - index.html missing");
    }
    
    log(`✅ Serving SPA fallback for route: ${req.path} -> ${indexPath}`);
    
    // Set proper headers for SPA
    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.sendFile(indexPath, (err) => {
      if (err) {
        log(`ERROR sending file: ${err.message}`);
        res.status(500).send("Error loading page");
      }
    });
  });
}
