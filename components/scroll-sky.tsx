"use client";

import { useEffect, useRef } from "react";

type CloudLayer = "cirrus" | "mid" | "near";

type CloudPuff = {
  offsetX: number;
  offsetY: number;
  radius: number;
  sunExposure: number;
};

export default function ScrollSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<HTMLDivElement>(null);
  const windRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    const starsLayer = starsRef.current;
    if (!canvasElement || !starsLayer) return;

    const ctx = canvasElement.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let pixelRatio = 1;
    let isNight = document.documentElement.dataset.theme === "night";
    let nightTransition = isNight ? 1 : 0;
    let windMultiplier = 1;
    let clouds: RealisticCloud[] = [];
    let animationFrame = 0;
    let lastFrameTime = 0;
    let renderedFrames = 0;
    let touchY: number | null = null;
    let touchX: number | null = null;
    let isDisposed = false;

    const BASE_WIND = 1;
    const MAX_WIND = 16;
    const WIND_FRICTION = 0.965;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function isMobile() {
      return width < 640;
    }

    function resizeCanvas() {
      width = window.innerWidth;
      height = window.innerHeight;
      pixelRatio = Math.min(window.devicePixelRatio || 1, isMobile() ? 1 : 1.5);
      canvasElement.width = Math.max(1, Math.floor(width * pixelRatio));
      canvasElement.height = Math.max(1, Math.floor(height * pixelRatio));
      canvasElement.style.width = width + "px";
      canvasElement.style.height = height + "px";
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      initClouds();
      drawFrame(false);
    }

    function createStars() {
      starsLayer.replaceChildren();
      const fragment = document.createDocumentFragment();
      const count = isMobile() ? 62 : 120;
      const colors = ["#ffffff", "#fff8e7", "#dbeafe", "#e0e7ff"];

      for (let index = 0; index < count; index += 1) {
        const star = document.createElement("span");
        const bright = Math.random() > 0.88;
        const size = bright ? Math.random() * 2.2 + 1.8 : Math.random() * 1.6 + 0.7;
        star.className = "sky-star";
        star.style.width = size + "px";
        star.style.height = size + "px";
        star.style.left = Math.random() * 100 + "%";
        star.style.top = Math.random() * 82 + "%";
        star.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        if (bright) star.style.boxShadow = "0 0 6px 1px rgba(255,255,255,.8)";
        star.style.setProperty("--star-duration", (Math.random() * 3.5 + 2).toFixed(1) + "s");
        star.style.setProperty("--star-delay", (Math.random() * 4).toFixed(1) + "s");
        fragment.appendChild(star);
      }

      starsLayer.appendChild(fragment);
    }

    class RealisticCloud {
      layer: CloudLayer;
      depth = 0;
      x = 0;
      y = 0;
      baseSpeed = 0;
      verticalDrift = 0;
      wavePhase = 0;
      waveFreq = 0;
      waveAmp = 0;
      scale = 1;
      cloudWidth = 0;
      puffs: CloudPuff[] = [];

      constructor(layer: CloudLayer, initialX: number | null = null) {
        this.layer = layer;
        this.reset(initialX);
      }

      reset(initialX: number | null = null) {
        if (this.layer === "cirrus") {
          this.depth = 0.28 + Math.random() * 0.14;
          this.y = height * (0.08 + Math.random() * 0.25);
          this.baseSpeed = 0.11 + Math.random() * 0.06;
          this.verticalDrift = -0.025 + (Math.random() - 0.5) * 0.02;
        } else if (this.layer === "mid") {
          this.depth = 0.55 + Math.random() * 0.22;
          this.y = height * (0.22 + Math.random() * 0.34);
          this.baseSpeed = 0.22 + Math.random() * 0.1;
          this.verticalDrift = -0.045 + (Math.random() - 0.5) * 0.035;
        } else {
          this.depth = 0.88 + Math.random() * 0.32;
          this.y = height * (0.36 + Math.random() * 0.38);
          this.baseSpeed = 0.36 + Math.random() * 0.15;
          this.verticalDrift = -0.065 + (Math.random() - 0.5) * 0.04;
        }

        this.wavePhase = Math.random() * Math.PI * 2;
        this.waveFreq = 0.0025 + Math.random() * 0.002;
        this.waveAmp = (0.04 + Math.random() * 0.05) * this.depth;
        this.scale = this.depth * (isMobile() ? 0.65 : 1.05);

        const span = (this.layer === "cirrus" ? 280 : 210 + Math.random() * 140) * this.scale;
        const puffCount = this.layer === "cirrus"
          ? (isMobile() ? 7 : 9)
          : (isMobile() ? 11 + Math.floor(Math.random() * 3) : 14 + Math.floor(Math.random() * 8));

        this.puffs = [];
        for (let index = 0; index < puffCount; index += 1) {
          const position = index / Math.max(1, puffCount - 1);
          const envelope = Math.sin(position * Math.PI);
          const offsetX = (position - 0.5) * span + (Math.random() - 0.5) * 28 * this.scale;
          const domeHeight = this.layer === "cirrus" ? 12 : 48 + Math.random() * 34;
          const offsetY = -Math.pow(envelope, 1.35) * domeHeight * this.scale * (0.25 + Math.random() * 0.85);
          const baseRadius = this.layer === "cirrus"
            ? 18 + envelope * 22
            : 26 + envelope * 44 + Math.random() * 16;

          this.puffs.push({
            offsetX,
            offsetY,
            radius: baseRadius * this.scale,
            sunExposure: Math.min(1, Math.max(0, (-offsetY / (domeHeight * this.scale + 1)) * 0.85 + position * 0.25))
          });
        }

        this.puffs.sort((a, b) => b.offsetY - a.offsetY);
        this.cloudWidth = span + 180 * this.scale;
        this.x = initialX !== null ? initialX : -this.cloudWidth * 0.7 - Math.random() * 250;
      }

      update() {
        this.wavePhase += this.waveFreq * Math.max(1, windMultiplier * 0.6);
        this.x += this.baseSpeed * windMultiplier;
        this.y += (this.verticalDrift + Math.sin(this.wavePhase) * this.waveAmp) * windMultiplier;

        const marginX = this.cloudWidth * 0.65;
        const marginY = 140 * this.scale;
        if (this.x - marginX > width) {
          this.reset(-marginX);
        } else if (this.y + marginY < -40) {
          this.y = height + marginY * 0.7;
          this.x = Math.max(-marginX, this.x - width * 0.25);
        } else if (this.y - marginY > height + 40) {
          this.y = -marginY * 0.7;
          this.x = Math.max(-marginX, this.x - width * 0.25);
        }
      }

      draw(nightAmount: number) {
        ctx.save();
        ctx.translate(this.x, this.y);

        const layerAlpha = this.layer === "cirrus" ? 0.52 : this.layer === "mid" ? 0.86 : 0.96;
        for (const puff of this.puffs) {
          const gradient = ctx.createRadialGradient(
            puff.offsetX + puff.radius * 0.25,
            puff.offsetY - puff.radius * 0.35,
            puff.radius * 0.08,
            puff.offsetX,
            puff.offsetY,
            puff.radius
          );

          if (nightAmount < 0.5) {
            const topAlpha = (0.85 + puff.sunExposure * 0.15) * layerAlpha;
            const midAlpha = (0.68 + puff.sunExposure * 0.15) * layerAlpha;
            const underR = Math.round(218 + puff.sunExposure * 32);
            const underG = Math.round(234 + puff.sunExposure * 18);
            gradient.addColorStop(0, "rgba(255,255,253," + topAlpha + ")");
            gradient.addColorStop(0.55, "rgba(246,251,255," + midAlpha + ")");
            gradient.addColorStop(0.85, "rgba(" + underR + "," + underG + ",255," + midAlpha * 0.72 + ")");
            gradient.addColorStop(1, "rgba(" + underR + "," + underG + ",255,0)");
          } else {
            const topAlpha = (0.72 + puff.sunExposure * 0.22) * layerAlpha;
            const midAlpha = (0.55 + puff.sunExposure * 0.18) * layerAlpha;
            const rimR = Math.round(185 + puff.sunExposure * 55);
            const rimG = Math.round(205 + puff.sunExposure * 42);
            const rimB = Math.round(240 + puff.sunExposure * 15);
            gradient.addColorStop(0, "rgba(" + rimR + "," + rimG + "," + rimB + "," + topAlpha + ")");
            gradient.addColorStop(0.52, "rgba(115,142,192," + midAlpha + ")");
            gradient.addColorStop(0.85, "rgba(52,74,122," + midAlpha * 0.68 + ")");
            gradient.addColorStop(1, "rgba(32,48,88,0)");
          }

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(puff.offsetX, puff.offsetY, puff.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }

    function initClouds() {
      clouds = [];
      const cirrusCount = isMobile() ? 3 : 5;
      const midCount = isMobile() ? 4 : 6;
      const nearCount = isMobile() ? 3 : 5;

      const addLayer = (layer: CloudLayer, count: number, extraWidth: number) => {
        for (let index = 0; index < count; index += 1) {
          const startX = (index / count) * (width + extraWidth) - extraWidth / 2;
          clouds.push(new RealisticCloud(layer, startX));
        }
      };

      addLayer("cirrus", cirrusCount, 400);
      addLayer("mid", midCount, 400);
      addLayer("near", nearCount, 450);
      clouds.sort((a, b) => a.depth - b.depth);
    }

    function updateWindLabel() {
      if (windRef.current) windRef.current.textContent = windMultiplier.toFixed(1) + "×";
      if (badgeRef.current) {
        badgeRef.current.textContent = isNight
          ? "Nuit étoilée · Clair de lune"
          : "Ciel ensoleillé · Brise douce";
      }
    }

    function drawFrame(advance: boolean) {
      ctx.clearRect(0, 0, width, height);
      const targetNight = isNight ? 1 : 0;
      if (advance) nightTransition += (targetNight - nightTransition) * 0.04;
      else nightTransition = targetNight;

      if (advance && windMultiplier > BASE_WIND) {
        windMultiplier = BASE_WIND + (windMultiplier - BASE_WIND) * WIND_FRICTION;
        if (windMultiplier - BASE_WIND < 0.02) windMultiplier = BASE_WIND;
      }

      for (const cloud of clouds) {
        if (advance) cloud.update();
        cloud.draw(nightTransition);
      }

      renderedFrames += 1;
      if (renderedFrames % 8 === 0 || !advance) updateWindLabel();
    }

    function animate(time: number) {
      if (isDisposed || document.hidden || reduceMotion.matches) {
        animationFrame = 0;
        return;
      }

      const frameInterval = isMobile() ? 1000 / 30 : 1000 / 45;
      if (time - lastFrameTime >= frameInterval) {
        lastFrameTime = time;
        drawFrame(true);
      }
      animationFrame = window.requestAnimationFrame(animate);
    }

    function startAnimation() {
      if (isDisposed || document.hidden || reduceMotion.matches || animationFrame !== 0) return;
      animationFrame = window.requestAnimationFrame(animate);
    }

    function stopAnimation() {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
    }

    function boostWind(impulse = 5.5) {
      windMultiplier = Math.min(MAX_WIND, windMultiplier + impulse);
      updateWindLabel();
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("a,button,input,textarea,select,summary,[role='button']")) return;
      boostWind(6.5);
    }

    function handleWheel(event: WheelEvent) {
      const delta = Math.abs(event.deltaY) || Math.abs(event.deltaX) || 30;
      boostWind(Math.min(4.5, (delta / 40) * 1.8));
    }

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length === 0) return;
      touchY = event.touches[0].clientY;
      touchX = event.touches[0].clientX;
    }

    function handleTouchMove(event: TouchEvent) {
      if (event.touches.length === 0 || touchY === null || touchX === null) return;
      const deltaY = Math.abs(event.touches[0].clientY - touchY);
      const deltaX = Math.abs(event.touches[0].clientX - touchX);
      const movement = Math.max(deltaY, deltaX);
      if (movement > 4) boostWind(Math.min(3.5, movement * 0.08));
      touchY = event.touches[0].clientY;
      touchX = event.touches[0].clientX;
    }

    function handleTouchEnd() {
      touchY = null;
      touchX = null;
    }

    function handleThemeChange() {
      isNight = document.documentElement.dataset.theme === "night";
      updateWindLabel();
      if (reduceMotion.matches) drawFrame(false);
    }

    const themeObserver = new MutationObserver(handleThemeChange);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });

    function handleVisibilityChange() {
      if (document.hidden) stopAnimation();
      else startAnimation();
    }

    function handleMotionPreferenceChange() {
      if (reduceMotion.matches) {
        stopAnimation();
        drawFrame(false);
      } else {
        startAnimation();
      }
    }

    resizeCanvas();
    createStars();
    updateWindLabel();

    window.addEventListener("resize", resizeCanvas, { passive: true });
    window.addEventListener("click", handleClick);
    window.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    reduceMotion.addEventListener("change", handleMotionPreferenceChange);

    if (reduceMotion.matches) drawFrame(false);
    else startAnimation();

    return () => {
      isDisposed = true;
      stopAnimation();
      themeObserver.disconnect();
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      reduceMotion.removeEventListener("change", handleMotionPreferenceChange);
      starsLayer.replaceChildren();
    };
  }, []);

  return (
    <>
      <div className="scroll-sky" aria-hidden="true">
        <div className="sky-milky-way" />
        <div className="sky-stars" ref={starsRef} />
        <div className="sky-sun-wrapper">
          <div className="sky-sun-rays" />
          <div className="sky-sun"><span /></div>
        </div>
        <div className="sky-moon">
          <span className="sky-moon-sea" />
          <span className="sky-moon-crater sky-moon-crater-one" />
          <span className="sky-moon-crater sky-moon-crater-two" />
          <span className="sky-moon-crater sky-moon-crater-three" />
        </div>
        <canvas ref={canvasRef} className="sky-clouds-canvas" />
      </div>
      <div className="sky-weather-badge" aria-hidden="true">
        <span className="sky-weather-dot" />
        <span ref={badgeRef}>Ciel ensoleillé · Brise douce</span>
        <span ref={windRef} className="sky-wind-speed">1.0×</span>
      </div>
    </>
  );
}
