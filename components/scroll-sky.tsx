"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";

type CloudPuff = { x: number; y: number; radius: number };
type Cloud = { x: number; y: number; speed: number; scale: number; puffs: CloudPuff[] };

function makeCloud(width: number, height: number, x?: number): Cloud {
  const scale = 0.55 + Math.random() * 0.8;
  const puffs = Array.from({ length: 8 + Math.floor(Math.random() * 5) }, (_, index, all) => {
    const t = index / Math.max(1, all.length - 1);
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

export default function ScrollSky() {
  const distantClouds = useRef<HTMLDivElement>(null);
  const nearClouds = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) return;

    let frame = 0;
    const updateClouds = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const scroll = window.scrollY || 0;
        if (distantClouds.current) distantClouds.current.style.transform = `translate3d(0, ${scroll * -0.10}px, 0)`;
        if (nearClouds.current) nearClouds.current.style.transform = `translate3d(0, ${scroll * -0.19}px, 0)`;
      });
    };

    updateClouds();
    window.addEventListener("scroll", updateClouds, { passive: true });
    window.addEventListener("resize", updateClouds, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateClouds);
      window.removeEventListener("resize", updateClouds);
    };
  }, []);

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
      clouds = Array.from({ length: width < 640 ? 7 : 12 }, (_, index, all) =>
        makeCloud(width, height, (index / all.length) * (width + 380) - 160)
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
      <div className="scroll-sky-clouds scroll-sky-clouds-distant" ref={distantClouds} />
      <div className="scroll-sky-clouds scroll-sky-clouds-near" ref={nearClouds} />
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
