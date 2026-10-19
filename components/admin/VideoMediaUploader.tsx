"use client";

import { useState, useRef, useId, useEffect } from "react";
import { extractYouTubeId, extractVimeoId, getEmbedVideoUrl, getAutoThumbnailUrl } from "@/lib/videos";

interface VideoMediaUploaderProps {
  initialVideoUrl?: string;
  initialThumbnailUrl?: string;
}

export function VideoMediaUploader({
  initialVideoUrl = "",
  initialThumbnailUrl = "",
}: VideoMediaUploaderProps) {
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl);
  const [thumbnailUrl, setThumbnailUrl] = useState(initialThumbnailUrl);
  const [videoMode, setVideoMode] = useState<"url" | "upload">("url");
  const [thumbMode, setThumbMode] = useState<"auto" | "url" | "upload">("auto");

  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [thumbError, setThumbError] = useState<string | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const preview = getEmbedVideoUrl(videoUrl);
  const autoThumb = getAutoThumbnailUrl(videoUrl, thumbnailUrl);

  // Sync state if initial props change
  useEffect(() => {
    if (initialVideoUrl && !videoUrl) setVideoUrl(initialVideoUrl);
    if (initialThumbnailUrl && !thumbnailUrl) setThumbnailUrl(initialThumbnailUrl);
  }, [initialVideoUrl, initialThumbnailUrl]);

  async function handleVideoFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideoError(null);

    // Vercel serverless request body is capped at 4.5MB
    const MAX_DIRECT_VIDEO_BYTES = 4.5 * 1024 * 1024;
    if (file.size > MAX_DIRECT_VIDEO_BYTES) {
      setVideoError(
        `This file is ${(file.size / 1024 / 1024).toFixed(1)}MB. Direct file upload is capped at 4.5MB on cloud hosting. To publish longer or high-definition videos, please upload to YouTube or Vimeo and paste the link above.`
      );
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }

    setUploadingVideo(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "video");

      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        if (res.status === 413 || text.toLowerCase().includes("request entity too large")) {
          throw new Error("File exceeds server upload size limit (4.5MB). Please paste a YouTube link instead.");
        }
        throw new Error(text.slice(0, 120) || "Server returned an unexpected response.");
      }

      if (!res.ok) {
        throw new Error(data.error || "Video upload failed.");
      }

      setVideoUrl(data.url);
      setVideoMode("url"); // Switch to preview
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Failed to upload video from device.");
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  async function handleThumbFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setThumbError(null);

    const MAX_DIRECT_THUMB_BYTES = 4.5 * 1024 * 1024;
    if (file.size > MAX_DIRECT_THUMB_BYTES) {
      setThumbError(
        `Image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Limit is 4.5MB. Please choose a smaller image.`
      );
      if (thumbInputRef.current) thumbInputRef.current.value = "";
      return;
    }

    setUploadingThumb(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "thumbnail");

      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        if (res.status === 413 || text.toLowerCase().includes("request entity too large")) {
          throw new Error("Image exceeds upload limit (4.5MB). Please choose a smaller file.");
        }
        throw new Error(text.slice(0, 120) || "Server returned an unexpected response.");
      }

      if (!res.ok) {
        throw new Error(data.error || "Thumbnail upload failed.");
      }

      setThumbnailUrl(data.url);
      setThumbMode("upload");
    } catch (err) {
      setThumbError(err instanceof Error ? err.message : "Failed to upload thumbnail image.");
    } finally {
      setUploadingThumb(false);
      if (thumbInputRef.current) thumbInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Hidden inputs submitted with the form */}
      <input type="hidden" name="videoUrl" value={videoUrl} />
      <input type="hidden" name="thumbnailUrl" value={thumbnailUrl} />

      {/* 1. Video Source Section */}
      <div className="rounded-xl border border-border bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <span className="font-semibold text-ink">Video Source</span>
          <div className="flex rounded-lg border border-border-strong p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setVideoMode("url")}
              className={`cursor-pointer rounded-md px-3 py-1 font-medium transition ${
                videoMode === "url" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              YouTube / Web Link
            </button>
            <button
              type="button"
              onClick={() => setVideoMode("upload")}
              className={`cursor-pointer rounded-md px-3 py-1 font-medium transition ${
                videoMode === "upload" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              Upload from Device
            </button>
          </div>
        </div>

        {videoMode === "url" ? (
          <div className="mt-3 flex flex-col gap-2">
            <label className="text-xs text-ink-muted">
              Enter YouTube (watch, shorts, or live), Vimeo, or direct MP4 link:
            </label>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value);
                setVideoError(null);
              }}
              required
              placeholder="e.g. https://www.youtube.com/shorts/... or https://youtu.be/..."
              className="rounded-md border border-border-strong bg-paper-raised p-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <label className="text-xs text-ink-muted">
              Choose an MP4, WebM, MOV, or OGG video file from your computer or phone:
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/ogg"
                onChange={handleVideoFileUpload}
                disabled={uploadingVideo}
                className="text-xs text-ink file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-accent-dark"
              />
              {uploadingVideo && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-accent">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  Uploading video to storage...
                </span>
              )}
            </div>
          </div>
        )}

        {videoError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{videoError}</p>
        )}

        {/* Live Video Preview Box */}
        {videoUrl && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-semibold text-ink-muted">Live Video Preview</p>
            <div className="mt-2 aspect-video w-full max-w-lg overflow-hidden rounded-xl bg-black shadow">
              {preview.type === "youtube" || preview.type === "vimeo" ? (
                <iframe
                  src={preview.embedUrl}
                  title="Video Preview"
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <video
                  src={videoUrl}
                  controls
                  playsInline
                  className="h-full w-full object-contain"
                >
                  Your browser does not support the video tag.
                </video>
              )}
            </div>
            <p className="mt-1 truncate text-[11px] text-ink-muted">Source: {videoUrl}</p>
          </div>
        )}
      </div>

      {/* 2. Thumbnail Section */}
      <div className="rounded-xl border border-border bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <span className="font-semibold text-ink">Thumbnail Poster</span>
          <div className="flex rounded-lg border border-border-strong p-0.5 text-xs">
            <button
              type="button"
              onClick={() => {
                setThumbMode("auto");
                setThumbnailUrl("");
              }}
              className={`cursor-pointer rounded-md px-2.5 py-1 font-medium transition ${
                thumbMode === "auto" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              Auto (YouTube)
            </button>
            <button
              type="button"
              onClick={() => setThumbMode("url")}
              className={`cursor-pointer rounded-md px-2.5 py-1 font-medium transition ${
                thumbMode === "url" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              Custom URL
            </button>
            <button
              type="button"
              onClick={() => setThumbMode("upload")}
              className={`cursor-pointer rounded-md px-2.5 py-1 font-medium transition ${
                thumbMode === "upload" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              Upload Image
            </button>
          </div>
        </div>

        {thumbMode === "auto" && (
          <p className="mt-3 text-xs text-ink-muted">
            {extractYouTubeId(videoUrl)
              ? "A high-resolution poster will be automatically extracted from your YouTube video."
              : "Paste a YouTube link above for automatic thumbnail extraction, or select Custom URL / Upload Image."}
          </p>
        )}

        {thumbMode === "url" && (
          <div className="mt-3 flex flex-col gap-1.5">
            <label className="text-xs text-ink-muted">Enter image URL (JPG, PNG, WebP):</label>
            <input
              type="url"
              value={thumbnailUrl}
              onChange={(e) => {
                setThumbnailUrl(e.target.value);
                setThumbError(null);
              }}
              placeholder="https://... (image URL)"
              className="rounded-md border border-border-strong bg-paper-raised p-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>
        )}

        {thumbMode === "upload" && (
          <div className="mt-3 flex flex-col gap-2">
            <label className="text-xs text-ink-muted">Upload an image poster from your device:</label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={thumbInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleThumbFileUpload}
                disabled={uploadingThumb}
                className="text-xs text-ink file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-accent-dark"
              />
              {uploadingThumb && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-accent">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  Uploading thumbnail...
                </span>
              )}
            </div>
          </div>
        )}

        {thumbError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{thumbError}</p>
        )}

        {/* Thumbnail preview */}
        {autoThumb && (
          <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
            <img
              src={autoThumb}
              alt="Thumbnail preview"
              className="h-16 w-28 rounded-lg border border-border object-cover"
            />
            <span className="text-xs text-ink-muted">
              {thumbnailUrl ? "Custom thumbnail active" : "Auto YouTube thumbnail active"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
