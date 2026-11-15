"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";

type CloudPuff = { x: number; y: number; radius: number };
type Cloud = { x: number; y: number; speed: number; scale: number; puffs: CloudPuff[] };
type DayLayer = "cirrus" | "mid" | "near";
type DayPuff = {
  offsetX: number;
  offsetY: number;
  radius: number;
  sunExposure: number;
};
type DayCloud = {
  layer: DayLayer;
  x: number;
  y: number;
  depth: number;
  baseSpeed: number;
  verticalDrift: number;
  wavePhase: number;
  waveFreq: number;
  waveAmp: number;
  scale: number;
  cloudWidth: number;
  puffs: DayPuff[];
};

function makeCloud(width: number, height: number, x?: number): Cloud {
  const scale = 0.55 + Math.random() * 0.8;
  const puffCount = 8 + Math.floor(Math.random() * 5);
  const puffs = Array.from({ length: puffCount }, (_, index) => {
    const t = index / Math.max(1, puffCount - 1);
    const envelope = Math.sin(t * Math.PI);
    return {
      x: (t - 0.5) * (180 + Math.random() * 95) * scale,
      y: -envelope * (18 + Math.random() * 35) * scale + (Math.random() - 0.5) * 13 * scale,
      radius: (23 + envelope * 29 + Math.random() * 12) * scale
    };
  });
  return {
    x: x ?? -180 - Math.random() * width,
    y: height * (0.22 + Math.random() * 0.52),
    speed: 0.12 + Math.random() * 0.22,
    scale,
    puffs
  };
}

/** Nuages diurnes volumétriques repris du modèle fourni, optimisés pour le site. */
function makeDayCloud(layer: DayLayer, width: number, height: number, initialX?: number): DayCloud {
  let depth: number;
  let y: number;
  let baseSpeed: number;
  let verticalDrift: number;

  if (layer === "cirrus") {
    depth = 0.28 + Math.random() * 0.14;
    y = height * (0.08 + Math.random() * 0.25);
    baseSpeed = 0.11 + Math.random() * 0.06;
    verticalDrift = -0.025 + (Math.random() - 0.5) * 0.02;
  } else if (layer === "mid") {
    depth = 0.55 + Math.random() * 0.22;
    y = height * (0.22 + Math.random() * 0.34);
    baseSpeed = 0.22 + Math.random() * 0.1;
    verticalDrift = -0.045 + (Math.random() - 0.5) * 0.035;
  } else {
    depth = 0.88 + Math.random() * 0.32;
    y = height * (0.36 + Math.random() * 0.38);
    baseSpeed = 0.36 + Math.random() * 0.15;
    verticalDrift = -0.065 + (Math.random() - 0.5) * 0.04;
  }

  const wavePhase = Math.random() * Math.PI * 2;
  const waveFreq = 0.0025 + Math.random() * 0.002;
  const waveAmp = (0.04 + Math.random() * 0.05) * depth;
  const scale = depth * (width < 640 ? 0.65 : 1.05);
  const span = (layer === "cirrus" ? 280 : 210 + Math.random() * 140) * scale;
  const puffCount = layer === "cirrus" ? 9 : Math.floor(14 + Math.random() * 8);
  const puffs: DayPuff[] = [];

  for (let index = 0; index < puffCount; index++) {
    const t = index / (puffCount - 1);
    const envelope = Math.sin(t * Math.PI);
    const offsetX = (t - 0.5) * span + (Math.random() - 0.5) * 28 * scale;
    const domeHeight = layer === "cirrus" ? 12 : 48 + Math.random() * 34;
    const verticalLift = Math.pow(envelope, 1.35) * domeHeight * scale;
    const offsetY = -verticalLift * (0.25 + Math.random() * 0.85);
    const baseRadius = layer === "cirrus"
      ? 18 + envelope * 22
      : 26 + envelope * 44 + Math.random() * 16;
    const radius = baseRadius * scale;
    const sunExposure = Math.min(
      1,
      Math.max(0, (-offsetY / (domeHeight * scale + 1)) * 0.85 + t * 0.25)
    );

    puffs.push({ offsetX, offsetY, radius, sunExposure });
  }

  puffs.sort((a, b) => b.offsetY - a.offsetY);
  const cloudWidth = span + 180 * scale;
  const marginX = cloudWidth * 0.65;

  return {
    layer,
    x: initialX ?? -marginX - Math.random() * 250,
    y,
    depth,
    baseSpeed,
    verticalDrift,
    wavePhase,
    waveFreq,
    waveAmp,
    scale,
    cloudWidth,
    puffs
  };
}

function advanceDayCloud(cloud: DayCloud, width: number, height: number, wind: number): DayCloud {
  cloud.wavePhase += cloud.waveFreq * Math.max(1, wind * 0.6);
  cloud.x += cloud.baseSpeed * wind;
  cloud.y += (cloud.verticalDrift + Math.sin(cloud.wavePhase) * cloud.waveAmp) * wind;

  const marginX = cloud.cloudWidth * 0.65;
  const marginY = 140 * cloud.scale;

  if (cloud.x - marginX > width) {
    return makeDayCloud(cloud.layer, width, height, -marginX);
  }
  if (cloud.y + marginY < -40) {
    cloud.y = height + marginY * 0.7;
    cloud.x = Math.max(-marginX, cloud.x - width * 0.25);
  } else if (cloud.y - marginY > height + 40) {
    cloud.y = -marginY * 0.7;
    cloud.x = Math.max(-marginX, cloud.x - width * 0.25);
  }
  return cloud;
}

function drawDayCloud(context: CanvasRenderingContext2D, cloud: DayCloud) {
  context.save();
  context.translate(cloud.x, cloud.y);
  const layerAlpha = cloud.layer === "cirrus" ? 0.52 : cloud.layer === "mid" ? 0.86 : 0.96;

  for (const puff of cloud.puffs) {
    const gradient = context.createRadialGradient(
      puff.offsetX + puff.radius * 0.25,
      puff.offsetY - puff.radius * 0.35,
      puff.radius * 0.08,
      puff.offsetX,
      puff.offsetY,
      puff.radius
    );
    const topAlpha = (0.85 + puff.sunExposure * 0.15) * layerAlpha;
    const midAlpha = (0.68 + puff.sunExposure * 0.15) * layerAlpha;
    const underR = Math.round(218 + puff.sunExposure * 32);
    const underG = Math.round(234 + puff.sunExposure * 18);

    gradient.addColorStop(0, `rgba(255, 255, 253, ${topAlpha})`);
    gradient.addColorStop(0.55, `rgba(246, 251, 255, ${midAlpha})`);
    gradient.addColorStop(0.85, `rgba(${underR}, ${underG}, 255, ${midAlpha * 0.72})`);
    gradient.addColorStop(1, `rgba(${underR}, ${underG}, 255, 0)`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(puff.offsetX, puff.offsetY, puff.radius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

export default function ScrollSky() {
  const dayCanvas = useRef<HTMLCanvasElement>(null);
  const nightCanvas = useRef<HTMLCanvasElement>(null);
  const stars = useMemo(
    () => Array.from({ length: 112 }, (_, index) => ({
      id: index,
      left: (index * 37.13 + (index % 7) * 11.7) % 100,
      top: (index * 19.71 + (index % 9) * 7.3) % 78,
      size: index % 11 === 0 ? 2.5 : 0.8 + (index % 5) * 0.32,
      duration: 2.4 + (index % 8) * 0.55,
      delay: -((index % 13) * 0.37)
    })),
    []
  );

  // Scène claire : trois strates de nuages, éclairage solaire et vent progressif.
  useEffect(() => {
    const canvas = dayCanvas.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let wind = 1;
    let isDay = document.documentElement.dataset.theme !== "night";
    let clouds: DayCloud[] = [];
    let lastTouchX = 0;
    let lastTouchY = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const counts = width < 640
        ? { cirrus: 2, mid: 3, near: 2 }
        : { cirrus: 3, mid: 4, near: 3 };
      clouds = [];
      (Object.entries(counts) as [DayLayer, number][]).forEach(([layer, count]) => {
        for (let index = 0; index < count; index++) {
          const startX = (index / count) * (width + 430) - 215;
          clouds.push(makeDayCloud(layer, width, height, startX));
        }
      });
      clouds.sort((a, b) => a.depth - b.depth);
    };

    const render = (advance: boolean) => {
      context.clearRect(0, 0, width, height);
      clouds = clouds.map((cloud) =>
        advance ? advanceDayCloud(cloud, width, height, wind) : cloud
      );
      for (const cloud of clouds) drawDayCloud(context, cloud);
    };

    const animate = () => {
      if (!isDay) return;
      render(true);
      wind = 1 + (wind - 1) * 0.965;
      if (wind < 1.03) wind = 1;
      if (!reduceMotion.matches) frame = requestAnimationFrame(animate);
    };

    const start = () => {
      cancelAnimationFrame(frame);
      if (!isDay) return;
      if (reduceMotion.matches) render(false);
      else animate();
    };

    const boostWind = (amount: number) => {
      if (isDay && !reduceMotion.matches) wind = Math.min(16, wind + amount);
    };
    const onWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaY) || Math.abs(event.deltaX) || 30;
      boostWind(Math.min(4.5, (delta / 40) * 1.8));
    };
    const onTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? 0;
      lastTouchX = event.touches[0]?.clientX ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const movement = Math.max(Math.abs(touch.clientY - lastTouchY), Math.abs(touch.clientX - lastTouchX));
      if (movement > 4) boostWind(Math.min(3.5, movement * 0.08));
      lastTouchY = touch.clientY;
      lastTouchX = touch.clientX;
    };

    const themeObserver = new MutationObserver(() => {
      isDay = document.documentElement.dataset.theme !== "night";
      if (isDay) start();
      else {
        cancelAnimationFrame(frame);
        context.clearRect(0, 0, width, height);
      }
    });

    resize();
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
    window.addEventListener("resize", resize);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    if (isDay) start();

    return () => {
      cancelAnimationFrame(frame);
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  // Scène nocturne existante : elle reste indépendante du rendu diurne.
  useEffect(() => {
    const canvas = nightCanvas.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let wind = 1;
    let isNight = document.documentElement.dataset.theme === "night";
    let clouds: Cloud[] = [];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cloudCount = width < 640 ? 7 : 12;
      clouds = Array.from({ length: cloudCount }, (_, index) =>
        makeCloud(width, height, (index / cloudCount) * (width + 380) - 160)
      );
    };

    const themeObserver = new MutationObserver(() => {
      isNight = document.documentElement.dataset.theme === "night";
      if (isNight) start();
      else {
        cancelAnimationFrame(frame);
        context.clearRect(0, 0, width, height);
      }
    });

    const boostWind = (amount: number) => {
      wind = Math.min(9, wind + amount);
    };
    const onWheel = (event: WheelEvent) => boostWind(Math.min(2.8, Math.abs(event.deltaY) / 110));
    let lastTouchY = 0;
    const onTouchStart = (event: TouchEvent) => { lastTouchY = event.touches[0]?.clientY ?? 0; };
    const onTouchMove = (event: TouchEvent) => {
      const nextY = event.touches[0]?.clientY ?? lastTouchY;
      boostWind(Math.min(1.8, Math.abs(nextY - lastTouchY) / 90));
      lastTouchY = nextY;
    };

    const drawCloud = (cloud: Cloud) => {
      context.save();
      context.translate(cloud.x, cloud.y);
      for (const puff of cloud.puffs) {
        const gradient = context.createRadialGradient(
          puff.x - puff.radius * 0.2,
          puff.y - puff.radius * 0.35,
          puff.radius * 0.05,
          puff.x,
          puff.y,
          puff.radius
        );
        gradient.addColorStop(0, "rgba(235, 244, 255, .78)");
        gradient.addColorStop(0.48, "rgba(150, 178, 220, .46)");
        gradient.addColorStop(0.82, "rgba(63, 91, 145, .22)");
        gradient.addColorStop(1, "rgba(32, 51, 93, 0)");
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(puff.x, puff.y, puff.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    };

    const animate = () => {
      if (!isNight) return;
      context.clearRect(0, 0, width, height);
      for (const cloud of clouds) {
        if (!reduceMotion.matches) cloud.x += cloud.speed * wind;
        if (cloud.x > width + 220) {
          const replacement = makeCloud(width, height, -220);
          cloud.x = replacement.x;
          cloud.y = replacement.y;
          cloud.speed = replacement.speed;
          cloud.scale = replacement.scale;
          cloud.puffs = replacement.puffs;
        }
        drawCloud(cloud);
      }
      wind = 1 + (wind - 1) * 0.975;
      if (wind < 1.03) wind = 1;
      if (!reduceMotion.matches) frame = requestAnimationFrame(animate);
    };

    function start() {
      cancelAnimationFrame(frame);
      if (isNight) {
        if (!clouds.length) resize();
        animate();
      }
    }

    resize();
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", resize);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    if (isNight) start();

    return () => {
      cancelAnimationFrame(frame);
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return (
    <div className="scroll-sky" aria-hidden="true">
      <canvas className="day-sky-cloud-canvas" ref={dayCanvas} />
      <div className="day-sky-sun">
        <div className="day-sky-sun-rays" />
        <div className="day-sky-sun-disc" />
      </div>
      <div className="night-sky">
        <div className="night-sky-milky-way" />
        <div className="night-sky-stars">
          {stars.map((star) => (
            <span
              className={star.id % 11 === 0 ? "night-star night-star-bright" : "night-star"}
              key={star.id}
              style={{
                left: `${star.left}%`,
                top: `${star.top}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                animationDuration: `${star.duration}s`,
                animationDelay: `${star.delay}s`
              } as CSSProperties}
            />
          ))}
        </div>
        <div className="night-sky-moon">
          <span className="moon-crater moon-crater-one" />
          <span className="moon-crater moon-crater-two" />
          <span className="moon-crater moon-crater-three" />
        </div>
        <canvas className="night-sky-cloud-canvas" ref={nightCanvas} />
      </div>
    </div>
  );
}
